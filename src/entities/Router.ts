import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection, ChainId } from '../types';
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
    isKyberSupportedChain,
} from './helper';
import { MarketEntity } from './MarketEntity';
import { ScyEntity } from './ScyEntity';
import { YtEntity } from './YtEntity';
import { RouterStatic } from '@pendle/core-v2/typechain-types';
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
        readonly chainId: ChainId
    ) {
        this.contract = new Contract(address, IPAllActionABI, networkConnection.provider) as IPAllAction;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    static getRouter(networkConnection: NetworkConnection, chainId: ChainId): Router {
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
        if (!isKyberSupportedChain(this.chainId)) {
            throw new Error(`Chain ${this.chainId} is not supported for kybercall.`);
        }
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
            const input: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData,
            };

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
            const input: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData,
            };

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
            const amountIn = await new ScyEntity(
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
        market: Address | MarketEntity,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidityDualScyAndPt(receiver, marketAddr, scyDesired, ptDesired, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidityDualScyAndPt(
                receiver,
                marketAddr,
                scyDesired,
                ptDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                overrides
            );
    }

    async addLiquidityDualTokenAndPt(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidityDualTokenAndPt(
                receiver,
                marketAddr,
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
                marketAddr,
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
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netLpOut, netPtToSwap } = await this.routerStatic.callStatic.addLiquiditySinglePtStatic(
            marketAddr,
            netPtIn
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySinglePt(
                receiver,
                marketAddr,
                netPtIn,
                calcSlippedDownAmount(netLpOut, slippage),
                Router.guessInApproxParams(netPtToSwap, slippage),
                overrides
            );
    }

    async addLiquiditySingleScy(
        receiver: Address,
        market: Address | MarketEntity,
        netScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netLpOut, netPtFromSwap } = await this.routerStatic.callStatic.addLiquiditySingleScyStatic(
            marketAddr,
            netScyIn
        );

        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySingleScy(
                receiver,
                marketAddr,
                netScyIn,
                calcSlippedDownAmount(netLpOut, slippage),
                Router.guessOutApproxParams(netPtFromSwap, slippage),
                overrides
            );
    }

    async addLiquiditySingleToken(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const tokenMintScyList = await market.scyEntity().then((scy) => scy.getTokensIn());

        const { netLpOut, netPtFromSwap, input } = await this.zapInputParams(
            tokenIn,
            netTokenIn,
            tokenMintScyList,
            (input) =>
                this.routerStatic.callStatic.addLiquiditySingleBaseTokenStatic(
                    marketAddr,
                    input.tokenIn,
                    input.netTokenIn
                )
        );

        if (netLpOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap in', tokenIn, marketAddr);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquiditySingleToken(
                receiver,
                marketAddr,
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
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netScyOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidityDualScyAndPt(
                receiver,
                marketAddr,
                lpToRemove,
                Router.MIN_AMOUNT,
                Router.MIN_AMOUNT
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidityDualScyAndPt(
                receiver,
                marketAddr,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async removeLiquidityDualTokenAndPt(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netIbTokenOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidityDualTokenAndPt(
                receiver,
                marketAddr,
                lpToRemove,
                tokenOut,
                Router.MIN_AMOUNT,
                Router.MIN_AMOUNT
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidityDualTokenAndPt(
                receiver,
                marketAddr,
                lpToRemove,
                tokenOut,
                calcSlippedDownAmount(netIbTokenOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async removeLiquiditySinglePt(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netPtOut, netPtFromSwap } = await this.routerStatic.callStatic.removeLiquiditySinglePtStatic(
            marketAddr,
            lpToRemove
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySinglePt(
                receiver,
                marketAddr,
                lpToRemove,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.guessOutApproxParams(netPtFromSwap, slippage),
                overrides
            );
    }

    async removeLiquiditySingleScy(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netScyOut } = await this.routerStatic.callStatic.removeLiquiditySingleScyStatic(marketAddr, lpToRemove);
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySingleScy(
                receiver,
                marketAddr,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                overrides
            );
    }

    async removeLiquiditySingleToken(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, approxScyIn] = await Promise.all([
            getSCYPromise,
            getSCYPromise.then((scy) => scy.getTokensOut()),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.removeLiquiditySingleScy(receiver, marketAddr, lpToRemove, Router.MIN_AMOUNT),
        ]);

        const { output, netOut } = await this.outputParams(
            scy.address,
            approxScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output, overrides);
    }

    async swapExactPtForScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForScy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForScy(receiver, marketAddr, exactPtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapPtForExactScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netPtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapPtForExactScy(
                receiver,
                marketAddr,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapPtForExactScy(
                receiver,
                marketAddr,
                exactScyOut,
                calcSlippedUpAmount(netPtIn, slippage),
                Router.guessInApproxParams(netPtIn, slippage),
                overrides
            );
    }

    async swapScyForExactPt(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactPt(receiver, marketAddr, exactPtOut, Router.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactPt(receiver, marketAddr, exactPtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactTokenForPt(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const tokenMintScyList = await market.scyEntity().then((scy) => scy.getTokensIn());
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForPt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    {
                        value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                    }
                )
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', tokenIn, marketAddr);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForPt(
                receiver,
                marketAddr,
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
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForPt(
                receiver,
                marketAddr,
                exactScyIn,
                Router.MIN_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForPt(
                receiver,
                marketAddr,
                exactScyIn,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.guessOutApproxParams(netPtOut, slippage),
                overrides
            );
    }

    async mintScyFromToken(
        receiver: Address,
        SCY: Address | ScyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof SCY === 'string') {
            SCY = new ScyEntity(SCY, this.networkConnection, this.chainId);
        }
        const SCYAddr = SCY.address;
        const tokenMintScyList = await SCY.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintScyFromToken(receiver, SCYAddr, Router.MIN_AMOUNT, input)
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, SCYAddr);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromToken(receiver, SCYAddr, calcSlippedDownAmount(netOut, slippage), input, overrides);
    }

    async redeemScyToToken(
        receiver: Address,
        SCY: Address | ScyEntity,
        netScyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof SCY === 'string') {
            SCY = new ScyEntity(SCY, this.networkConnection, this.chainId);
        }
        const SCYAddr = SCY.address;
        const tokenRedeemScyList = await SCY.getTokensOut();
        const { output, netOut } = await this.outputParams(
            SCY.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemScyToToken(receiver, SCYAddr, netScyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', SCY.address, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToToken(receiver, SCY.address, netScyIn, output, overrides);
    }

    async mintPyFromToken(
        receiver: Address,
        yt: Address | YtEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.networkConnection, this.chainId);
        }
        const ytAddr = yt.address;
        const SCY = await yt.scyEntity();
        const tokenMintScyList = await SCY.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintPyFromToken(receiver, ytAddr, Router.MIN_AMOUNT, input, {
                    value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                })
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromToken(receiver, ytAddr, calcSlippedDownAmount(netOut, slippage), input, {
                ...overrides,
                value: isNativeToken(tokenIn) ? netTokenIn : undefined,
            });
    }

    async redeemPyToToken(
        receiver: Address,
        yt: Address | YtEntity,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.networkConnection, this.chainId);
        }
        const ytAddr = yt.address;
        const getSCYPromise = yt.scyEntity();
        const [SCY, tokenRedeemScyList, pyIndex] = await Promise.all([
            getSCYPromise,
            getSCYPromise.then((scy) => scy.getTokensOut()),
            yt.pyIndexCurrent(),
        ]);
        const { output, netOut } = await this.outputParams(
            SCY.address,
            BN.from(netPyIn).mul(etherConstants.WeiPerEther).div(pyIndex),
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemPyToToken(receiver, ytAddr, netPyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToToken(receiver, ytAddr, netPyIn, output, overrides);
    }

    async swapExactScyForYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForYt(
                receiver,
                marketAddr,
                exactScyIn,
                Router.MIN_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForYt(
                receiver,
                marketAddr,
                exactScyIn,
                calcSlippedDownAmount(netYtOut, slippage),
                Router.guessOutApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapYtForExactScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netYtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapYtForExactScy(
                receiver,
                marketAddr,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapYtForExactScy(
                receiver,
                marketAddr,
                exactScyOut,
                calcSlippedUpAmount(netYtIn, slippage),
                Router.guessInApproxParams(netYtIn, slippage),
                overrides
            );
    }

    async swapExactPtForToken(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, netScyIn] = await Promise.all([
            getSCYPromise,
            getSCYPromise.then((scy) => scy.getTokensOut()),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactPtForScy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactPtForToken(receiver, marketAddr, exactPtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForToken(receiver, marketAddr, exactPtIn, output, overrides);
    }

    async swapExactYtForScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForScy(receiver, marketAddr, exactYtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapScyForExactYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactYt(receiver, marketAddr, exactYtOut, Router.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactYt(receiver, marketAddr, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactTokenForYt(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const scy = await market.scyEntity();
        const tokenMintScyList = await scy.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForYt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    {
                        value: isNativeToken(tokenIn) ? netTokenIn : undefined,
                    }
                )
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForYt(
                receiver,
                marketAddr,
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
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, netScyIn] = await Promise.all([
            getSCYPromise,
            getSCYPromise.then((scy) => scy.getTokensOut()),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactYtForToken(receiver, marketAddr, exactYtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForToken(receiver, marketAddr, exactYtIn, output, overrides);
    }

    async swapExactYtForPt(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netPtOut, totalPtSwapped } = await this.routerStatic.callStatic.swapExactYtForPtStatic(
            marketAddr,
            exactYtIn
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForPt(
                receiver,
                marketAddr,
                exactYtIn,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.guessInApproxParams(totalPtSwapped, slippage),
                overrides
            );
    }

    async swapExactPtForYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netYtOut, totalPtToSwap } = await this.routerStatic.callStatic.swapExactPtForYtStatic(
            marketAddr,
            exactPtIn
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForYt(
                receiver,
                marketAddr,
                exactPtIn,
                calcSlippedDownAmount(netYtOut, slippage),
                Router.guessInApproxParams(totalPtToSwap, slippage),
                overrides
            );
    }
}
