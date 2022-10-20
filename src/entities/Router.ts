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
import { SyEntity } from './SyEntity';
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
        tokenMintSyList: Address[],
        fn: (input: TokenInputStruct) => Promise<{ netOut: BN; netSyFee: BN }>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
        netSyFee: BN;
    }> {
        const possibleOutAmounts = tokenMintSyList.map(async (tokenMintSy) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintSy);
            const input: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, input, kybercallData, netSyFee: etherConstants.Zero };
            }

            const { netOut, netSyFee } = await fn(input);
            return { netOut, netSyFee, input, kybercallData };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    // TODO: find a way to avoid this duplication
    async zapInputParams<T extends { netLpOut: BN; netPtFromSwap: BN }>(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintSyList: Address[],
        fn: (input: TokenInputStruct) => Promise<T>
    ): Promise<{
        netLpOut: BN;
        netPtFromSwap: BN;
        zapInInput: TokenInputStruct;
        kybercallData: KybercallData;
        tokenMintSy: Address;
    }> {
        const possibleOutAmounts = tokenMintSyList.map(async (tokenMintSy) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintSy);
            const zapInInput: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return {
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.NegativeOne,
                    zapInInput,
                    kybercallData,
                    tokenMintSy,
                };
            }

            const { netLpOut, netPtFromSwap } = await fn(zapInInput);
            return { netLpOut, netPtFromSwap, zapInInput, kybercallData, tokenMintSy };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netLpOut.gt(prev.netLpOut) ? cur : prev
        );
    }

    async outputParams(
        sy: Address,
        netSyIn: BigNumberish,
        tokenOut: Address,
        tokenRedeemSyList: Address[],
        fn: (output: TokenOutputStruct) => Promise<{ netOut: BN; netSyFee: BN }>,
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
        netSyFee: BN;
    }> {
        const possibleOutAmounts = tokenRedeemSyList.map(async (tokenRedeemSy) => {
            const amountIn = await new SyEntity(sy, this.networkConnection, this.chainId).previewRedeem(
                tokenRedeemSy,
                netSyIn
            );
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenRedeemSy, amount: amountIn }, tokenOut);
            const output: TokenOutputStruct = {
                tokenOut,
                tokenRedeemSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
                minTokenOut: Router.MIN_AMOUNT,
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, output, kybercallData, netSyFee: etherConstants.Zero };
            }

            const { netOut, netSyFee } = await fn(output);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
                netSyFee,
            };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualSyAndPt<T extends MetaMethodType = 'send'>(
        receiver: Address,
        market: Address | MarketEntity,
        syDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.addLiquidityDualSyAndPt(
            receiver,
            marketAddr,
            syDesired,
            ptDesired,
            Router.MIN_AMOUNT
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            receiver,
            marketAddr,
            syDesired,
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

    async addLiquiditySingleSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        netSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.addLiquiditySingleSyStatic(marketAddr, netSyIn);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleSy(
            receiver,
            marketAddr,
            netSyIn,
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
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn());

        const res = await this.zapInputParams(tokenIn, netTokenIn, tokenMintSyList, (input) =>
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

    async removeLiquidityDualSyAndPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.removeLiquidityDualSyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            Router.MIN_AMOUNT,
            Router.MIN_AMOUNT
        );
        const { netSyOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualSyAndPt(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
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

    async removeLiquiditySingleSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStatic.callStatic.removeLiquiditySingleSyStatic(marketAddr, lpToRemove);
        const { netSyOut } = res;
        return this.contract.metaCall.removeLiquiditySingleSy(
            receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
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
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee: intermediateSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.contract.callStatic.removeLiquiditySingleSy(receiver, marketAddr, lpToRemove, Router.MIN_AMOUNT),
        ]);

        const {
            output,
            netOut: netTokenOut,
            netSyFee: netSyFee,
        } = await this.outputParams(
            sy.address,
            intermediateSy,
            tokenOut,
            tokenRedeemSyList,
            (output) =>
                this.contract.callStatic
                    .removeLiquiditySingleToken(receiver, marketAddr, lpToRemove, output)
                    .then(({ netTokenOut, netSyFee }) => ({ netOut: netTokenOut, netSyFee })),
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
            { netTokenOut, intermediateSy, intermediateSyFee, netSyFee, output }
        );
    }

    async swapExactPtForSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactPtForSy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactPtForSy(
            receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapPtForExactSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapPtForExactSy(
            receiver,
            marketAddr,
            exactSyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netPtIn } = res;
        const approxParam = Router.guessInApproxParams(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactSy(
            receiver,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapSyForExactPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapSyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            Router.MAX_AMOUNT
        );
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactPt(
            receiver,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netSyIn, slippage),
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
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn());
        const overrides = {
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, (input) =>
            this.contract.callStatic
                .swapExactTokenForPt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    overrides
                )
                .then(({ netPtOut, netSyFee }) => ({ netOut: netPtOut, netSyFee }))
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

    async swapExactSyForPt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactSyForPt(
            receiver,
            marketAddr,
            exactSyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactSyForPt(
            receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async mintSyFromToken<T extends MetaMethodType>(
        receiver: Address,
        sy: Address | SyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.networkConnection, this.chainId);
        }
        const syAddr = sy.address;
        const tokenMintSyList = await sy.getTokensIn();
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, (input) =>
            this.contract.callStatic
                .mintSyFromToken(receiver, syAddr, Router.MIN_AMOUNT, input)
                .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
        );
        const { netOut, input } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, syAddr);
        }

        return this.contract.metaCall.mintSyFromToken(
            receiver,
            syAddr,
            calcSlippedDownAmount(netOut, slippage),
            input,
            metaMethodType,
            res
        );
    }

    async redeemSyToToken<T extends MetaMethodType>(
        receiver: Address,
        sy: Address | SyEntity,
        netSyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ) {
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.networkConnection, this.chainId);
        }
        const syAddr = sy.address;
        const tokenRedeemSyList = await sy.getTokensOut();
        const res = await this.outputParams(
            sy.address,
            netSyIn,
            tokenOut,
            tokenRedeemSyList,
            (output) =>
                this.contract.callStatic
                    .redeemSyToToken(receiver, syAddr, netSyIn, output)
                    .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero })),
            slippage
        );

        const { output, netOut } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', sy.address, tokenOut);
        }

        return this.contract.metaCall.redeemSyToToken(receiver, sy.address, netSyIn, output, metaMethodType, res);
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
        const sy = await yt.syEntity();
        const tokenMintSyList = await sy.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, (input) =>
            this.contract.callStatic
                .mintPyFromToken(receiver, ytAddr, Router.MIN_AMOUNT, input, overrides)
                .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
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
        const getsyPromise = yt.syEntity();
        const [sy, tokenRedeemSyList, pyIndex] = await Promise.all([
            getsyPromise,
            getsyPromise.then((sy) => sy.getTokensOut()),
            yt.pyIndexCurrent(),
        ]);
        const res = await this.outputParams(
            sy.address,
            new PyIndex(pyIndex).assetToSy(netPyIn),
            tokenOut,
            tokenRedeemSyList,
            (output) =>
                this.contract.callStatic
                    .redeemPyToToken(receiver, ytAddr, netPyIn, output)
                    .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero })),

            slippage
        );
        const { netOut, output } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract.metaCall.redeemPyToToken(receiver, ytAddr, netPyIn, output, metaMethodType, res);
    }

    async swapExactSyForYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactSyForYt(
            receiver,
            marketAddr,
            exactSyIn,
            Router.MIN_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netYtOut } = res;
        const approxParam = Router.guessOutApproxParams(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapYtForExactSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapYtForExactSy(
            receiver,
            marketAddr,
            exactSyOut,
            Router.MAX_AMOUNT,
            Router.STATIC_APPROX_PARAMS
        );
        const { netYtIn } = res;
        const approxParam = Router.guessInApproxParams(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactSy(
            receiver,
            marketAddr,
            exactSyOut,
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
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee: intermediateSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.contract.callStatic.swapExactPtForSy(receiver, marketAddr, exactPtIn, Router.MIN_AMOUNT),
        ]);
        const res = await this.outputParams(
            sy.address,
            intermediateSy,
            tokenOut,
            tokenRedeemSyList,
            (output) =>
                this.contract.callStatic
                    .swapExactPtForToken(receiver, marketAddr, exactPtIn, output)
                    .then(({ netTokenOut, netSyFee }) => ({ netOut: netTokenOut, netSyFee })),
            slippage
        );

        const { output, netOut } = res;

        if (netOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract.metaCall.swapExactPtForToken(receiver, marketAddr, exactPtIn, output, metaMethodType, {
            ...res,
            intermediateSy,
            intermediateSyFee,
        });
    }

    async swapExactYtForSy<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapExactYtForSy(receiver, marketAddr, exactYtIn, 0);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactYtForSy(
            receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapSyForExactYt<T extends MetaMethodType>(
        receiver: Address,
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.contract.callStatic.swapSyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            Router.MAX_AMOUNT
        );
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactYt(
            receiver,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netSyIn, slippage),
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
        const sy = await market.syEntity();
        const tokenMintSyList = await sy.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, (input) =>
            this.contract.callStatic
                .swapExactTokenForYt(
                    receiver,
                    marketAddr,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    input,
                    overrides
                )
                .then(({ netYtOut, netSyFee }) => ({ netOut: netYtOut, netSyFee }))
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
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee: intermediateSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.contract.callStatic.swapExactYtForSy(receiver, marketAddr, exactYtIn, Router.MIN_AMOUNT),
        ]);
        const res = await this.outputParams(
            sy.address,
            intermediateSy,
            tokenOut,
            tokenRedeemSyList,
            (output) =>
                this.contract.callStatic
                    .swapExactYtForToken(receiver, marketAddr, exactYtIn, output)
                    .then(({ netTokenOut, netSyFee }) => ({ netOut: netTokenOut, netSyFee })),
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
            intermediateSy,
            intermediateSyFee,
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
