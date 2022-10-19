import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants } from 'ethers';
import { getContractAddresses, getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount, calcSlippedUpAmount, PyIndex } from './math';
import { MarketEntity } from './MarketEntity';
import { ScyEntity } from './ScyEntity';
import { YtEntity } from './YtEntity';
import { RouterStatic } from '@pendle/core-v2/typechain-types';
import { NoRouteFoundError } from '../errors';
import { KyberHelper, KybercallData, KyberState, KyberHelperConfig } from './KyberHelper';
import { WrappedContract, createContractObject, MetaMethodType } from '../contractHelper';
import { Multicall } from '../multicall';

export type RouterState = {
    kyberHelper: KyberState;
};

export type RouterConfig = {
    kyberHelper: KyberHelperConfig;
    multicall?: Multicall;
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
    readonly contract: WrappedContract<IPAllAction>;
    readonly routerStatic: WrappedContract<RouterStatic>;
    readonly kyberHelper: KyberHelper;
    readonly multicall?: Multicall;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: RouterConfig
    ) {
        const { kyberHelper: kyberHelperConfig } = { ...config };
        this.contract = createContractObject<IPAllAction>(address, IPAllActionABI, networkConnection, {
            multicall: config?.multicall,
        });
        this.routerStatic = getRouterStatic(networkConnection, chainId, { multicall: config?.multicall });

        this.kyberHelper = new KyberHelper(address, networkConnection, chainId, kyberHelperConfig);
        this.multicall = this.multicall;
    }

    get state(): RouterState {
        return {
            kyberHelper: this.kyberHelper.state,
        };
    }

    set state(value: RouterState) {
        this.kyberHelper.state = value.kyberHelper;
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

    async inputParams(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintScyList: Address[],
        fn: (input: TokenInputStruct) => Promise<{ netOut: BN; netScyFee: BN }>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
        netScyFee: BN;
    }> {
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintScy);
            const input: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, input, kybercallData, netScyFee: etherConstants.Zero };
            }

            const { netOut, netScyFee } = await fn(input);
            return { netOut, netScyFee, input, kybercallData };
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
        zapInInput: TokenInputStruct;
        kybercallData: KybercallData;
        tokenMintScy: Address;
    }> {
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintScy);
            const zapInInput: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return {
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.NegativeOne,
                    zapInInput,
                    kybercallData,
                    tokenMintScy,
                };
            }

            const { netLpOut, netPtFromSwap } = await fn(zapInInput);
            return { netLpOut, netPtFromSwap, zapInInput, kybercallData, tokenMintScy };
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
        fn: (output: TokenOutputStruct) => Promise<{ netOut: BN; netScyFee: BN }>,
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
        netScyFee: BN;
    }> {
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const amountIn = await new ScyEntity(SCY, this.networkConnection, this.chainId).previewRedeem(
                tokenRedeemScy,
                netScyIn
            );
            const kybercallData = await this.kyberHelper.makeCall(
                { token: tokenRedeemScy, amount: amountIn },
                tokenOut
            );
            const output: TokenOutputStruct = {
                tokenOut,
                tokenRedeemScy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
                minTokenOut: Router.MIN_AMOUNT,
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, output, kybercallData, netScyFee: etherConstants.Zero };
            }

            const { netOut, netScyFee } = await fn(output);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
                netScyFee,
            };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualScyAndPt<T extends MetaMethodType = 'send'>(
        receiver: Address,
        market: Address | MarketEntity,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.addLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            scyDesired,
            ptDesired,
            Router.MIN_AMOUNT
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            scyDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            metaMethodType,
            res
        );
    }

    async addLiquidityDualTokenAndPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const overrides = {
            value: isNativeToken(tokenIn) ? tokenDesired : undefined,
        };
        const res = await this.contract.callStatic.addLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired,
            Router.MIN_AMOUNT,
            overrides
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            metaMethodType,
            { ...res, overrides }
        );
    }

    async addLiquiditySinglePt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.addLiquiditySinglePtStatic(marketAddr, netPtIn);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(netPtToSwap, slippage);
        return this.contract.metaCall.addLiquiditySinglePt(
            receiver,
            marketAddr,
            netPtIn,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async addLiquiditySingleScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        netScyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.addLiquiditySingleScyStatic(marketAddr, netScyIn);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleScy(
            receiver,
            marketAddr,
            netScyIn,
            calcSlippedDownAmount(netLpOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async addLiquiditySingleToken<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const tokenMintScyList = await market.scyEntity().then((scy) => scy.getTokensIn());

        const res = await this.zapInputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.routerStatic.callStatic.addLiquiditySingleBaseTokenStatic(marketAddr, input.tokenIn, input.netTokenIn)
        );

        const { netLpOut, netPtFromSwap, zapInInput } = res;

        if (netLpOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap in', tokenIn, marketAddr);
        }

        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleToken(
            receiver,
            marketAddr,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            zapInInput,
            metaMethodType,
            {
                ...res,
                overrides: {
                    value: isNativeToken(zapInInput.tokenIn) ? zapInInput.netTokenIn : undefined,
                },
            }
        );
    }

    async removeLiquidityDualScyAndPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.removeLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            Router.MIN_AMOUNT,
            Router.MIN_AMOUNT
        );
        const { netScyOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualScyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netScyOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquidityDualTokenAndPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.removeLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            tokenOut,
            Router.MIN_AMOUNT,
            Router.MIN_AMOUNT
        );
        const { netTokenOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualTokenAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            tokenOut,
            calcSlippedDownAmount(netTokenOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySinglePt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.removeLiquiditySinglePtStatic(marketAddr, lpToRemove);
        const { netPtOut, netPtFromSwap } = res;
        return this.contract.metaCall.removeLiquiditySinglePt(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySingleScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.removeLiquiditySingleScyStatic(marketAddr, lpToRemove);
        const { netScyOut } = res;
        return this.contract.metaCall.removeLiquiditySingleScy(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netScyOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySingleToken<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, { netScyOut: intermediateScy, netScyFee: intermediateScyFee }] =
            await Promise.all([
                getSCYPromise,
                getSCYPromise.then((scy) => scy.getTokensOut()),
                this.contract.callStatic.removeLiquiditySingleScy(receiver, marketAddr, lpToRemove, Router.MIN_AMOUNT),
            ]);

        const {
            output,
            netOut: netTokenOut,
            netScyFee,
        } = await this.outputParams(
            scy.address,
            intermediateScy,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract.callStatic
                    .removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output)
                    .then(({ netTokenOut, netScyFee }) => ({ netOut: netTokenOut, netScyFee })),
            slippage
        );

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        return this.contract.metaCall.removeLiquiditySingleToken(
            receiver,
            marketAddr,
            lpToRemove,
            output,
            metaMethodType,
            { netTokenOut, intermediateScy, intermediateScyFee, netScyFee, output }
        );
    }

    async swapExactPtForScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactPtForScy(
            receiver,
            marketAddr,
            exactPtIn,
            Router.MIN_AMOUNT
        );
        const { netScyOut } = res;
        return this.contract.metaCall.swapExactPtForScy(
            receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netScyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapPtForExactScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapPtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netPtIn } = res;
        const approxParam = Router.guessInApproxParams(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapScyForExactPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapScyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            Router.MAX_AMOUNT
        );
        const { netScyIn } = res;
        return this.contract.metaCall.swapScyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netScyIn, slippage),
            metaMethodType,
            res
        );
    }

    async swapExactTokenForPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const tokenMintScyList = await market.scyEntity().then((scy) => scy.getTokensIn());
        const overrides = {
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract.callStatic
                .swapExactTokenForPt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    overrides
                )
                .then(({ netPtOut, netScyFee }) => ({ netOut: netPtOut, netScyFee }))
        );

        const { netOut, input } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', tokenIn, marketAddr);
        }

        return this.contract.metaCall.swapExactTokenForPt(
            receiver,
            marketAddr,
            calcSlippedDownAmount(netOut, slippage),
            Router.guessOutApproxParams(netOut, slippage),
            input,
            metaMethodType,
            { ...res, overrides }
        );
    }

    async swapExactScyForPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactScyForPt(
            receiver,
            marketAddr,
            exactScyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactScyForPt(
            receiver,
            marketAddr,
            exactScyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async mintScyFromToken<T extends MetaMethodType>(
        receiver: Address,
        SCY: Address | ScyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof SCY === 'string') {
            SCY = new ScyEntity(SCY, this.networkConnection, this.chainId);
        }
        const SCYAddr = SCY.address;
        const tokenMintScyList = await SCY.getTokensIn();
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract.callStatic
                .mintScyFromToken(receiver, SCYAddr, Router.MIN_AMOUNT, input)
                .then((netOut) => ({ netOut, netScyFee: etherConstants.Zero }))
        );
        const { netOut, input } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, SCYAddr);
        }

        return this.contract.metaCall.mintScyFromToken(
            receiver,
            SCYAddr,
            calcSlippedDownAmount(netOut, slippage),
            input,
            metaMethodType,
            res
        );
    }

    async redeemScyToToken<T extends MetaMethodType>(
        receiver: Address,
        SCY: Address | ScyEntity,
        netScyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof SCY === 'string') {
            SCY = new ScyEntity(SCY, this.networkConnection, this.chainId);
        }
        const SCYAddr = SCY.address;
        const tokenRedeemScyList = await SCY.getTokensOut();
        const res = await this.outputParams(
            SCY.address,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract.callStatic
                    .redeemScyToToken(receiver, SCYAddr, netScyIn, output)
                    .then((netOut) => ({ netOut, netScyFee: etherConstants.Zero })),
            slippage
        );

        const { output, netOut } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', SCY.address, tokenOut);
        }

        return this.contract.metaCall.redeemScyToToken(receiver, SCY.address, netScyIn, output, metaMethodType, res);
    }

    async mintPyFromToken<T extends MetaMethodType>(
        receiver: Address,
        yt: Address | YtEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.networkConnection, this.chainId);
        }
        const ytAddr = yt.address;
        const SCY = await yt.scyEntity();
        const tokenMintScyList = await SCY.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract.callStatic
                .mintPyFromToken(receiver, ytAddr, Router.MIN_AMOUNT, input, overrides)
                .then((netOut) => ({ netOut, netScyFee: etherConstants.Zero }))
        );
        const { netOut, input } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }

        return this.contract.metaCall.mintPyFromToken(
            receiver,
            ytAddr,
            calcSlippedDownAmount(netOut, slippage),
            input,
            metaMethodType,
            { ...res, overrides }
        );
    }

    async redeemPyToToken<T extends MetaMethodType>(
        receiver: Address,
        yt: Address | YtEntity,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
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
        const res = await this.outputParams(
            SCY.address,
            new PyIndex(pyIndex).assetToScy(netPyIn),
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract.callStatic
                    .redeemPyToToken(receiver, ytAddr, netPyIn, output)
                    .then((netOut) => ({ netOut, netScyFee: etherConstants.Zero })),

            slippage
        );
        const { netOut, output } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract.metaCall.redeemPyToToken(receiver, ytAddr, netPyIn, output, metaMethodType, res);
    }

    async swapExactScyForYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactScyForYt(
            receiver,
            marketAddr,
            exactScyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netYtOut } = res;
        const approxParam = Router.guessOutApproxParams(netYtOut, slippage);
        return this.contract.metaCall.swapExactScyForYt(
            receiver,
            marketAddr,
            exactScyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapYtForExactScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactScyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapYtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netYtIn } = res;
        const approxParam = Router.guessInApproxParams(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactScy(
            receiver,
            marketAddr,
            exactScyOut,
            calcSlippedUpAmount(netYtIn, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapExactPtForToken<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, { netScyOut: intermediateScy, netScyFee: intermediateScyFee }] =
            await Promise.all([
                getSCYPromise,
                getSCYPromise.then((scy) => scy.getTokensOut()),
                this.contract.callStatic.swapExactPtForScy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT),
            ]);
        const res = await this.outputParams(
            scy.address,
            intermediateScy,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract.callStatic
                    .swapExactPtForToken(receiver, marketAddr, exactPtIn, output)
                    .then(({ netTokenOut, netScyFee }) => ({ netOut: netTokenOut, netScyFee })),
            slippage
        );

        const { output, netOut } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract.metaCall.swapExactPtForToken(receiver, marketAddr, exactPtIn, output, metaMethodType, {
            ...res,
            intermediateScy,
            intermediateScyFee,
        });
    }

    async swapExactYtForScy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, 0);
        const { netScyOut } = res;
        return this.contract.metaCall.swapExactYtForScy(
            receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netScyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapScyForExactYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapScyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            Router.MAX_AMOUNT
        );
        const { netScyIn } = res;
        return this.contract.metaCall.swapScyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netScyIn, slippage),
            metaMethodType,
            res
        );
    }

    async swapExactTokenForYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const scy = await market.scyEntity();
        const tokenMintScyList = await scy.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract.callStatic
                .swapExactTokenForYt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    overrides
                )
                .then(({ netYtOut, netScyFee }) => ({ netOut: netYtOut, netScyFee }))
        );

        const { netOut, input } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        return this.contract.metaCall.swapExactTokenForYt(
            receiver,
            marketAddr,
            calcSlippedDownAmount(netOut, slippage),
            Router.guessOutApproxParams(netOut, slippage),
            input,
            metaMethodType,
            { ...res, overrides }
        );
    }

    async swapExactYtForToken<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.networkConnection, this.chainId);
        }
        const marketAddr = market.address;
        const getSCYPromise = market.scyEntity();
        const [scy, tokenRedeemScyList, { netScyOut: intermediateScy, netScyFee: intermediateScyFee }] =
            await Promise.all([
                getSCYPromise,
                getSCYPromise.then((scy) => scy.getTokensOut()),
                this.contract.callStatic.swapExactYtForScy(receiver, marketAddr, exactYtIn, Router.MIN_AMOUNT),
            ]);
        const res = await this.outputParams(
            scy.address,
            intermediateScy,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract.callStatic
                    .swapExactYtForToken(receiver, marketAddr, exactYtIn, output)
                    .then(({ netTokenOut, netScyFee }) => ({ netOut: netTokenOut, netScyFee })),
            slippage
        );

        const { netOut, output } = res;
        if (netOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract.metaCall.swapExactYtForToken(receiver, marketAddr, exactYtIn, output, metaMethodType, {
            ...res,
            intermediateScy,
            intermediateScyFee,
        });
    }

    async swapExactYtForPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.swapExactYtForPtStatic(marketAddr, exactYtIn);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = Router.guessInApproxParams(totalPtSwapped, slippage);
        return this.contract.metaCall.swapExactYtForPt(
            receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netPtOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapExactPtForYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.swapExactPtForYtStatic(marketAddr, exactPtIn);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(totalPtToSwap, slippage);
        return this.contract.metaCall.swapExactPtForYt(
            receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }
}
