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
import { BigNumber as BN, constants as etherConstants } from 'ethers';
import { KYBER_API, NATIVE_ADDRESS_0xEE } from '../constants';
import {
    getContractAddresses,
    getRouterStatic,
    isNativeToken,
    isSameAddress,
    isKyberSupportedChain,
    createContractObject,
    requiresSigner,
} from './helper';
import { calcSlippedDownAmount, calcSlippedUpAmount, PyIndex } from './math';
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
        this.contract = createContractObject<IPAllAction>(address, IPAllActionABI, networkConnection);
        this.routerStatic = getRouterStatic(networkConnection, chainId);
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
            const amountIn = await new ScyEntity(SCY, this.networkConnection, this.chainId).previewRedeem(
                tokenRedeemScy,
                netScyIn
            );
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

    @requiresSigner
    async addLiquidityDualScyAndPt(
        receiver: Address,
        market: Address | MarketEntity,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netLpOut] = await this.contract.callStatic.addLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            scyDesired,
            ptDesired,
            Router.MIN_AMOUNT
        );
        return this.contract.addLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            scyDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            overrides
        );
    }

    @requiresSigner
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
        const [netLpOut] = await this.contract.callStatic.addLiquidityDualTokenAndPt(
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
        return this.contract.addLiquidityDualTokenAndPt(
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

    @requiresSigner
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
        return this.contract.addLiquiditySinglePt(
            receiver,
            marketAddr,
            netPtIn,
            calcSlippedDownAmount(netLpOut, slippage),
            Router.guessInApproxParams(netPtToSwap, slippage),
            overrides
        );
    }

    @requiresSigner
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

        return this.contract.addLiquiditySingleScy(
            receiver,
            marketAddr,
            netScyIn,
            calcSlippedDownAmount(netLpOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            overrides
        );
    }

    @requiresSigner
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

        return this.contract.addLiquiditySingleToken(
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

    @requiresSigner
    async removeLiquidityDualScyAndPt(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netScyOut, netPtOut] = await this.contract.callStatic.removeLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            Router.MIN_AMOUNT,
            Router.MIN_AMOUNT
        );
        return this.contract.removeLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netScyOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            overrides
        );
    }

    @requiresSigner
    async removeLiquidityDualTokenAndPt(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const [netIbTokenOut, netPtOut] = await this.contract.callStatic.removeLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            tokenOut,
            Router.MIN_AMOUNT,
            Router.MIN_AMOUNT
        );
        return this.contract.removeLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            tokenOut,
            calcSlippedDownAmount(netIbTokenOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            overrides
        );
    }

    @requiresSigner
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
        return this.contract.removeLiquiditySinglePt(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            overrides
        );
    }

    @requiresSigner
    async removeLiquiditySingleScy(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netScyOut } = await this.routerStatic.callStatic.removeLiquiditySingleScyStatic(marketAddr, lpToRemove);
        return this.contract.removeLiquiditySingleScy(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netScyOut, slippage),
            overrides
        );
    }

    @requiresSigner
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
            this.contract.callStatic.removeLiquiditySingleScy(receiver, marketAddr, lpToRemove, Router.MIN_AMOUNT),
        ]);

        const { output, netOut } = await this.outputParams(
            scy.address,
            approxScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) => this.contract.callStatic.removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        return this.contract.removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output, overrides);
    }

    @requiresSigner
    async swapExactPtForScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyOut = await this.contract.callStatic.swapExactPtForScy(
            receiver,
            marketAddr,
            exactPtIn,
            Router.MIN_AMOUNT
        );
        return this.contract.swapExactPtForScy(
            receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netScyOut, slippage),
            overrides
        );
    }

    @requiresSigner
    async swapPtForExactScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netPtIn = await this.contract.callStatic.swapPtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        return this.contract.swapPtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            Router.guessInApproxParams(netPtIn, slippage),
            overrides
        );
    }

    @requiresSigner
    async swapScyForExactPt(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyIn = await this.contract.callStatic.swapScyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            Router.MAX_AMOUNT
        );
        return this.contract.swapScyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netScyIn, slippage),
            overrides
        );
    }

    @requiresSigner
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
            this.contract.callStatic.swapExactTokenForPt(
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

        return this.contract.swapExactTokenForPt(
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

    @requiresSigner
    async swapExactScyForPt(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netPtOut = await this.contract.callStatic.swapExactScyForPt(
            receiver,
            marketAddr,
            exactScyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        return this.contract.swapExactScyForPt(
            receiver,
            marketAddr,
            exactScyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            overrides
        );
    }

    @requiresSigner
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
            this.contract.callStatic.mintScyFromToken(receiver, SCYAddr, Router.MIN_AMOUNT, input)
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, SCYAddr);
        }

        return this.contract.mintScyFromToken(
            receiver,
            SCYAddr,
            calcSlippedDownAmount(netOut, slippage),
            input,
            overrides
        );
    }

    @requiresSigner
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
            (output) => this.contract.callStatic.redeemScyToToken(receiver, SCYAddr, netScyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', SCY.address, tokenOut);
        }

        return this.contract.redeemScyToToken(receiver, SCY.address, netScyIn, output, overrides);
    }

    @requiresSigner
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
            this.contract.callStatic.mintPyFromToken(receiver, ytAddr, Router.MIN_AMOUNT, input, {
                value: isNativeToken(tokenIn) ? netTokenIn : undefined,
            })
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }

        return this.contract.mintPyFromToken(receiver, ytAddr, calcSlippedDownAmount(netOut, slippage), input, {
            ...overrides,
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        });
    }

    @requiresSigner
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
            new PyIndex(pyIndex).assetToScy(netPyIn),
            tokenOut,
            tokenRedeemScyList,
            (output) => this.contract.callStatic.redeemPyToToken(receiver, ytAddr, netPyIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract.redeemPyToToken(receiver, ytAddr, netPyIn, output, overrides);
    }

    @requiresSigner
    async swapExactScyForYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netYtOut = await this.contract.callStatic.swapExactScyForYt(
            receiver,
            marketAddr,
            exactScyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        return this.contract.swapExactScyForYt(
            receiver,
            marketAddr,
            exactScyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            overrides
        );
    }

    @requiresSigner
    async swapYtForExactScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netYtIn = await this.contract.callStatic.swapYtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        return this.contract.swapYtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            calcSlippedUpAmount(netYtIn, slippage),
            Router.guessInApproxParams(netYtIn, slippage),
            overrides
        );
    }

    @requiresSigner
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
            this.contract.callStatic.swapExactPtForScy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) => this.contract.callStatic.swapExactPtForToken(receiver, marketAddr, exactPtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract.swapExactPtForToken(receiver, marketAddr, exactPtIn, output, overrides);
    }

    @requiresSigner
    async swapExactYtForScy(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyOut = await this.contract.callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, 0);
        return this.contract.swapExactYtForScy(
            receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netScyOut, slippage),
            overrides
        );
    }

    @requiresSigner
    async swapScyForExactYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const netScyIn = await this.contract.callStatic.swapScyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            Router.MAX_AMOUNT
        );
        return this.contract.swapScyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netScyIn, slippage),
            overrides
        );
    }

    @requiresSigner
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
            this.contract.callStatic.swapExactTokenForYt(
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

        return this.contract.swapExactTokenForYt(
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

    @requiresSigner
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
            this.contract.callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, Router.MIN_AMOUNT),
        ]);
        const { output, netOut } = await this.outputParams(
            scy.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) => this.contract.callStatic.swapExactYtForToken(receiver, marketAddr, exactYtIn, output),
            slippage
        );

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract.swapExactYtForToken(receiver, marketAddr, exactYtIn, output, overrides);
    }

    @requiresSigner
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
        return this.contract.swapExactYtForPt(
            receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessInApproxParams(totalPtSwapped, slippage),
            overrides
        );
    }

    @requiresSigner
    async swapExactPtForYt(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const { netYtOut, totalPtToSwap } = await this.routerStatic.callStatic.swapExactPtForYtStatic(
            marketAddr,
            exactPtIn
        );
        return this.contract.swapExactPtForYt(
            receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessInApproxParams(totalPtToSwap, slippage),
            overrides
        );
    }
}
