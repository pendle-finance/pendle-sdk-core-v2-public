import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection } from '../types';
import axios from 'axios';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { BigNumberish, BytesLike, ContractTransaction, Overrides } from 'ethers';
import { BigNumber as BN, constants as etherConstants, Contract } from 'ethers';
import { KYBER_API, NATIVE_ADDRESS_0xEE } from '../constants';
import {
    calcSlippedDownAmount,
    calcSlippedUpAmount,
    getContractAddresses,
    getRouterStatic,
    isNativeToken,
    isSameAddress,
} from './helper';
import { Market } from './Market';
import { SCY as SCYEntity } from './SCY';
import { YT as YTEntity } from './YT';
import { RouterStatic } from '@pendle/core-v2/typechain-types';
import { PT } from './PT';
import { NoRouteFoundError } from '../errors';

export type KybercallData = {
    amountInUsd?: number;
    amountOutUsd?: number;
    outputAmount: BigNumberish;
    encodedSwapData: BytesLike;
};

export class Router {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: Router.MIN_AMOUNT,
        guessMax: Router.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 256,
        eps: BN.from(10).pow(15),
    };
    readonly contract: IPAllAction;
    readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.contract = new Contract(address, IPAllActionABI, networkConnection.provider) as IPAllAction;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    static getRouter(networkConnection: NetworkConnection, chainId: number): Router {
        return new Router(getContractAddresses(chainId).ROUTER, networkConnection, chainId);
    }

    static guessOutApproxParams(guessAmountOut: BN, slippage: number): ApproxParamsStruct {
        return {
            ...Router.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountOut, 2 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountOut, 10 * slippage),
            guessOffchain: guessAmountOut,
        };
    }

    static guessInApproxParams(guessAmountIn: BN, slippage: number): ApproxParamsStruct {
        return {
            ...Router.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountIn, 10 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountIn, 2 * slippage),
            guessOffchain: guessAmountIn,
        };
    }

    async kybercall(tokenIn: Address, tokenOut: Address, amountIn: BigNumberish): Promise<KybercallData> {
        if (isSameAddress(tokenIn, tokenOut)) return { outputAmount: amountIn, encodedSwapData: [] };
        // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
        if (isNativeToken(tokenIn)) tokenIn = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(tokenOut)) tokenOut = NATIVE_ADDRESS_0xEE;

        const { data } = await axios
            .get(KYBER_API[this.chainId], {
                params: {
                    tokenIn,
                    tokenOut,
                    amountIn: BN.from(amountIn).toString(),
                    to: this.contract.address,
                    // set the slippage to 20% since we already enforced the minimum output in our contract
                    slippageTolerance: 2_000,
                },
                headers: { 'Accept-Version': 'Latest' },
            })
            .catch(() => {
                return {
                    data: {
                        outputAmount: 0,
                        encodedSwapData: undefined,
                    },
                };
            });
        return data;
    }

    async inputParams(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintScyList: Address[],
        fn: (input: TokenInputStruct) => Promise<BN>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
    }> {
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercallData = await this.kybercall(tokenIn, tokenMintScy, netTokenIn);
            const input = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData,
            } as TokenInputStruct;

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, input, kybercallData };
            }

            const netOut = await fn(input);
            return { netOut, input, kybercallData };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    // TODO: find a way to avoid this duplication
    async zapInputParams<T extends { netLpOut: BN; netPtFromSwap: BN }>(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintScyList: Address[],
        fn: (input: TokenInputStruct) => Promise<T>
    ): Promise<{
        netLpOut: BN;
        netPtFromSwap: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
    }> {
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercallData = await this.kybercall(tokenIn, tokenMintScy, netTokenIn);
            const input = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData,
            } as TokenInputStruct;

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return {
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.NegativeOne,
                    input,
                    kybercallData,
                };
            }

            const { netLpOut, netPtFromSwap } = await fn(input);
            return { netLpOut, netPtFromSwap, input, kybercallData };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netLpOut.gt(prev.netLpOut) ? cur : prev
        );
    }

    async outputParams(
        SCY: Address,
        netScyIn: BigNumberish,
        tokenOut: Address,
        tokenRedeemScyList: Address[],
        fn: (output: TokenOutputStruct) => Promise<BN>,
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
    }> {
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const amountIn = await new SCYEntity(
                SCY,
                this.networkConnection,
                this.chainId
            ).contract.callStatic.previewRedeem(tokenRedeemScy, netScyIn);
            const kybercallData = await this.kybercall(tokenRedeemScy, tokenOut, amountIn);
            const output = {
                tokenOut,
                tokenRedeemScy,
                kybercall: kybercallData.encodedSwapData,
                minTokenOut: Router.MIN_AMOUNT,
            } as TokenOutputStruct;

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, output, kybercallData };
            }

            const netOut = await fn(output);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
            };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualScyAndPt(
        receiver: Address,
        market: Address,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidityDualScyAndPt(receiver, market, scyDesired, ptDesired, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidityDualScyAndPt(
                receiver,
                market,
                scyDesired,
                ptDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                overrides
            );
    }

    async addLiquidityDualTokenAndPt(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidityDualTokenAndPt(
                receiver,
                market,
                tokenIn,
                tokenDesired,
                ptDesired,
                Router.MIN_AMOUNT,
                {
                    value: isNativeToken(tokenIn) ? tokenDesired : undefined,
                }
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidityDualTokenAndPt(
                receiver,
                market,
                tokenIn,
                tokenDesired,
                ptDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                {
                    ...overrides,
                    value: isNativeToken(tokenIn) ? tokenDesired : undefined,
                }
            );
    }

    async addLiquiditySinglePt(
        receiver: Address,
        market: Address,
        netPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { netLpOut, netPtToSwap } = await this.routerStatic.callStatic.addLiquiditySinglePtStatic(
            market,
            netPtIn
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySinglePt(
                receiver,
                market,
                netPtIn,
                calcSlippedDownAmount(netLpOut, slippage),
                Router.guessInApproxParams(netPtToSwap, slippage),
                overrides
            );
    }

    async addLiquiditySingleScy(
        receiver: Address,
        market: Address,
        netScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { netLpOut, netPtFromSwap } = await this.routerStatic.callStatic.addLiquiditySingleScyStatic(
            market,
            netScyIn
        );

        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySingleScy(
                receiver,
                market,
                netScyIn,
                calcSlippedDownAmount(netLpOut, slippage),
                Router.guessOutApproxParams(netPtFromSwap, slippage),
                overrides
            );
    }

    async addLiquiditySingleToken(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenMintScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();

        const { netLpOut, netPtFromSwap, input } = await this.zapInputParams(
            tokenIn,
            netTokenIn,
            tokenMintScyList,
            (input) =>
                this.routerStatic.callStatic.addLiquiditySingleBaseTokenStatic(market, input.tokenIn, input.netTokenIn)
        );

        if (netLpOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap in', tokenIn, market);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySingleToken(
                receiver,
                market,
                calcSlippedDownAmount(netLpOut, slippage),
                Router.guessOutApproxParams(netPtFromSwap, slippage),
                input,
                {
                    ...overrides,
                    value: isNativeToken(input.tokenIn) ? input.netTokenIn : undefined,
                }
            );
    }

    async removeLiquidityDualScyAndPt(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netScyOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidityDualScyAndPt(receiver, market, lpToRemove, Router.MIN_AMOUNT, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidityDualScyAndPt(
                receiver,
                market,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async removeLiquidityDualTokenAndPt(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netIbTokenOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidityDualTokenAndPt(
                receiver,
                market,
                lpToRemove,
                tokenOut,
                Router.MIN_AMOUNT,
                Router.MIN_AMOUNT
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidityDualTokenAndPt(
                receiver,
                market,
                lpToRemove,
                tokenOut,
                calcSlippedDownAmount(netIbTokenOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async removeLiquiditySinglePt(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { netPtOut, netPtFromSwap } = await this.routerStatic.callStatic.removeLiquiditySinglePtStatic(
            market,
            lpToRemove
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySinglePt(
                receiver,
                market,
                lpToRemove,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.guessOutApproxParams(netPtFromSwap, slippage),
                overrides
            );
    }

    async removeLiquiditySingleScy(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { netScyOut } = await this.routerStatic.callStatic.removeLiquiditySingleScyStatic(market, lpToRemove);
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySingleScy(
                receiver,
                market,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                overrides
            );
    }

    async removeLiquiditySingleToken(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const [tokenRedeemScyList, approxScyIn] = await Promise.all([
            new SCYEntity(scy, this.networkConnection, this.chainId).contract.callStatic.getTokensOut(),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.removeLiquiditySingleScy(receiver, market, lpToRemove, Router.MIN_AMOUNT),
        ]);

        const { output, netOut } = await this.outputParams(
            scy,
            approxScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.removeLiquiditySingleToken(receiver, market, lpToRemove, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', market, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySingleToken(receiver, market, lpToRemove, output, overrides);
    }

    async swapExactPtForScy(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForScy(receiver, market, exactPtIn, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForScy(receiver, market, exactPtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapPtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netPtIn, slippage),
                Router.guessInApproxParams(netPtIn, slippage),
                overrides
            );
    }

    async swapScyForExactPt(
        receiver: Address,
        market: Address,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactPt(receiver, market, exactPtOut, Router.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactPt(receiver, market, exactPtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactTokenForPt(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenMintScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForPt(
                    receiver,
                    market,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    {
                        value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                    }
                )
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', tokenIn, market);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForPt(
                receiver,
                market,
                calcSlippedDownAmount(netOut, slippage),
                Router.guessOutApproxParams(netOut, slippage),
                input,
                {
                    ...overrides,
                    value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                }
            );
    }

    async swapExactScyForPt(
        receiver: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForPt(receiver, market, exactScyIn, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForPt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.guessOutApproxParams(netPtOut, slippage),
                overrides
            );
    }

    async mintScyFromToken(
        receiver: Address,
        SCY: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const tokenMintScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintScyFromToken(receiver, SCY, Router.MIN_AMOUNT, input)
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, SCY);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromToken(receiver, SCY, calcSlippedDownAmount(netOut, slippage), input, overrides);
    }

    async redeemScyToToken(
        receiver: Address,
        SCY: Address,
        netScyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const tokenRedeemScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const { output, netOut } = await this.outputParams(
            SCY,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemScyToToken(receiver, SCY, netScyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', SCY, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToToken(receiver, SCY, netScyIn, output, overrides);
    }

    async mintPyFromToken(
        receiver: Address,
        YT: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const SCY = await new YTEntity(YT, this.networkConnection, this.chainId).contract.callStatic.SCY();
        const tokenMintScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintPyFromToken(receiver, YT, Router.MIN_AMOUNT, input, {
                    value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                })
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, YT);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromToken(receiver, YT, calcSlippedDownAmount(netOut, slippage), input, {
                ...overrides,
                value: isNativeToken(tokenIn) ? netTokenIn : undefined,
            });
    }

    async redeemPyToToken(
        receiver: Address,
        YT: Address,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const ytStatic = new YTEntity(YT, this.networkConnection, this.chainId).contract.callStatic;
        const [SCY, pyIndex] = await Promise.all([ytStatic.SCY(), ytStatic.pyIndexCurrent()]);
        const tokenRedeemScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const { output, netOut } = await this.outputParams(
            SCY,
            BN.from(netPyIn).mul(etherConstants.WeiPerEther).div(pyIndex),
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemPyToToken(receiver, YT, netPyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', YT, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToToken(receiver, YT, netPyIn, output, overrides);
    }

    async swapExactScyForYt(
        receiver: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForYt(receiver, market, exactScyIn, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForYt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netYtOut, slippage),
                Router.guessOutApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapYtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netYtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netYtIn, slippage),
                Router.guessInApproxParams(netYtIn, slippage),
                overrides
            );
    }

    async swapExactPtForToken(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy, pt } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const [tokenRedeemScyList, netScyIn] = await Promise.all([
            new SCYEntity(scy, this.networkConnection, this.chainId).contract.callStatic.getTokensOut(),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactPtForScy(receiver, market, exactPtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactPtForToken(receiver, market, exactPtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', pt, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForToken(receiver, market, exactPtIn, output, overrides);
    }

    async swapExactYtForScy(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForScy(receiver, market, exactYtIn, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForScy(receiver, market, exactYtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapScyForExactYt(
        receiver: Address,
        market: Address,
        exactYtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactYt(receiver, market, exactYtOut, Router.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactYt(receiver, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactTokenForYt(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy, pt } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenMintScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForYt(
                    receiver,
                    market,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    {
                        value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                    }
                )
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the YT address, does it worth it?
            let yt = await new PT(pt, this.networkConnection, this.chainId).contract.callStatic.YT();
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForYt(
                receiver,
                market,
                calcSlippedDownAmount(netOut, slippage),
                Router.guessOutApproxParams(netOut, slippage),
                input,
                {
                    ...overrides,
                    value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                }
            );
    }

    async swapExactYtForToken(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy, pt } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const [tokenRedeemScyList, netScyIn] = await Promise.all([
            new SCYEntity(scy, this.networkConnection, this.chainId).contract.callStatic.getTokensOut(),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactYtForScy(receiver, market, exactYtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactYtForToken(receiver, market, exactYtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the YT address, does it worth it?
            let yt = await new PT(pt, this.networkConnection, this.chainId).contract.callStatic.YT();
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForToken(receiver, market, exactYtIn, output, overrides);
    }
}
