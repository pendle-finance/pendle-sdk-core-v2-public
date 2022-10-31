import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import {
    RouterStatic,
    WrappedContract,
    MetaMethodType,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
    MetaMethodExtraParams,
    mergeMetaMethodExtraParams as mergeParams,
} from '../contracts';
import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { Address, NetworkConnection, ChainId, RawTokenAmount } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants } from 'ethers';
import { getContractAddresses, getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount, calcSlippedUpAmount, PyIndex } from './math';
import { MarketEntity } from './MarketEntity';
import { SyEntity } from './SyEntity';
import { YtEntity } from './YtEntity';
import { NoRouteFoundError } from '../errors';
import { KyberHelper, KybercallData, KyberState, KyberHelperCoreConfig } from './KyberHelper';

export type RouterState = {
    kyberHelper: KyberState;
};

export type RouterConfig = PendleEntityConfigOptionalAbi & {
    kyberHelper?: KyberHelperCoreConfig;
};

export type RouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver?: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
};

type FixedRouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllAction>,
    Data extends {}
> = MetaMethodReturnType<T, IPAllAction, M, Data & RouterMetaMethodExtraParams<T>>;

export class Router<C extends WrappedContract<IPAllAction> = WrappedContract<IPAllAction>> extends PendleEntity<C> {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: Router.MIN_AMOUNT,
        guessMax: Router.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 256,
        eps: BN.from(10).pow(15),
    };
    readonly routerStatic: WrappedContract<RouterStatic>;
    readonly kyberHelper: KyberHelper;

    constructor(readonly address: Address, readonly chainId: ChainId, config: RouterConfig) {
        super(address, chainId, { abi: IPAllActionABI, ...config });
        const { kyberHelper: kyberHelperCoreConfig } = { ...config };
        this.routerStatic = getRouterStatic(chainId, config);

        this.kyberHelper = new KyberHelper(address, chainId, {
            ...this.networkConnection,
            ...kyberHelperCoreConfig,
        });
    }

    protected get routerStaticCall() {
        return this.routerStatic.multicallStatic;
    }

    get state(): RouterState {
        return {
            kyberHelper: this.kyberHelper.state,
        };
    }

    set state(value: RouterState) {
        this.kyberHelper.state = value.kyberHelper;
    }

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): FixedRouterMetaMethodExtraParams<T> {
        return {
            ...super.getDefaultMetaMethodExtraParams(),
            receiver: ContractMetaMethod.utils.getContractSignerAddress,
        };
    }

    /**
     * Redefine the method to redefine the return type
     */
    addExtraParams<T extends MetaMethodType>(
        params: RouterMetaMethodExtraParams<T>
    ): FixedRouterMetaMethodExtraParams<T> {
        return mergeParams(this.getDefaultMetaMethodExtraParams(), params);
    }

    static getRouter(chainId: ChainId, networkConnection: NetworkConnection): Router {
        return new Router(getContractAddresses(chainId).ROUTER, chainId, networkConnection);
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
        fn: (tokenAmount: RawTokenAmount<BigNumberish>) => Promise<{ netOut: BN; netSyFee: BN }>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
        netSyFee: BN;
    }> {
        const processTokenMinSy = async (tokenMintSy: Address) => {
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

            const { netOut, netSyFee } = await fn({ token: tokenMintSy, amount: kybercallData.outputAmount }).catch(
                (_) => ({ netOut: etherConstants.NegativeOne, netSyFee: etherConstants.Zero })
            );

            return { netOut, netSyFee, input, kybercallData };
        };
        if (tokenMintSyList.includes(tokenIn)) {
            return processTokenMinSy(tokenIn);
        }
        const possibleOutAmounts = tokenMintSyList.map(processTokenMinSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    // TODO: find a way to avoid this duplication
    async zapInputParams<T extends { netLpOut: BN; netPtFromSwap: BN }>(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintSyList: Address[],
        fn: (input: TokenInputStruct, tokenAmount: BN) => Promise<T>
    ): Promise<{
        netLpOut: BN;
        netPtFromSwap: BN;
        zapInInput: TokenInputStruct;
        kybercallData: KybercallData;
    }> {
        const processTokenMinSy = async (tokenMintSy: Address) => {
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
                };
            }

            const { netLpOut, netPtFromSwap } = await fn(zapInInput, BN.from(kybercallData.outputAmount)).catch(
                (_) => ({
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.Zero,
                })
            );
            return { netLpOut, netPtFromSwap, zapInInput, kybercallData };
        };
        if (tokenMintSyList.includes(tokenIn)) {
            return processTokenMinSy(tokenIn);
        }
        const possibleOutAmounts = tokenMintSyList.map(processTokenMinSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netLpOut.gt(prev.netLpOut) ? cur : prev
        );
    }

    async outputParams(
        sy: Address,
        netSyIn: BigNumberish,
        tokenOut: Address,
        tokenRedeemSyList: Address[],
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
    }> {
        const processTokenRedeemSy = async (tokenRedeemSy: Address) => {
            const amountIn = await new SyEntity(sy, this.chainId, this.networkConnection).previewRedeem(
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

            const netOut = BN.from(kybercallData.outputAmount);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
            };
        };
        if (tokenRedeemSyList.includes(tokenOut)) {
            return processTokenRedeemSy(tokenOut);
        }
        const possibleOutAmounts = tokenRedeemSyList.map(processTokenRedeemSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualSyAndPt<T extends MetaMethodType = 'send'>(
        market: Address | MarketEntity,
        syDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualSyAndPt', { netLpOut: BN; netSyUsed: BN; netPtUsed: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquidityDualSyAndPtStatic(
            marketAddr,
            syDesired,
            ptDesired,
            params.multicall
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            syDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            { ..._params, ...res }
        );
    }

    async addLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualTokenAndPt', { netLpOut: BN; netTokenUsed: BN; netPtUsed: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const overrides = {
            value: isNativeToken(tokenIn) ? tokenDesired : undefined,
        };
        const res = await this.routerStaticCall.addLiquidityDualTokenAndPtStatic(
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired,
            params.multicall
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualTokenAndPt(
            params.receiver,
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            { ...res, ...mergeParams({ overrides }, params) }
        );
    }

    async addLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        _params: MetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySinglePt',
        { netLpOut: BN; netPtToSwap: BN; netSyFee: BN; priceImpact: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySinglePtStatic(marketAddr, netPtIn, params.multicall);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(netPtToSwap, slippage);
        return this.contract.metaCall.addLiquiditySinglePt(
            params.receiver,
            marketAddr,
            netPtIn,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async addLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleSy',
        { netLpOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyStatic(marketAddr, netSyIn, params.multicall);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleSy(
            params.receiver,
            marketAddr,
            netSyIn,
            calcSlippedDownAmount(netLpOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            { ...res, approxParam, ...params }
        );
    }

    async addLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleToken',
        { netLpOut: BN; netPtFromSwap: BN; zapInInput: TokenInputStruct; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn());

        const res = await this.zapInputParams(tokenIn, netTokenIn, tokenMintSyList, (input, tokenAmount) =>
            this.routerStaticCall.addLiquiditySingleBaseTokenStatic(
                marketAddr,
                input.tokenMintSy,
                tokenAmount,
                params.multicall
            )
        );

        const { netLpOut, netPtFromSwap, zapInInput } = res;

        if (netLpOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap in', tokenIn, marketAddr);
        }

        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        const overrides = {
            value: isNativeToken(zapInInput.tokenIn) ? zapInInput.netTokenIn : undefined,
        };

        return this.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            marketAddr,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            zapInInput,
            { ...res, ...mergeParams({ overrides }, params) }
        );
    }

    async removeLiquidityDualSyAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'removeLiquidityDualSyAndPt', { netSyOut: BN; netPtOut: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualSyAndPtStatic(
            marketAddr,
            lpToRemove,
            params.multicall
        );
        const { netSyOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'removeLiquidityDualTokenAndPt', { netTokenOut: BN; netPtOut: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualTokenAndPtStatic(
            marketAddr,
            lpToRemove,
            tokenOut,
            params.multicall
        );
        const { netTokenOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualTokenAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            tokenOut,
            calcSlippedDownAmount(netTokenOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySinglePt',
        { netPtOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySinglePtStatic(marketAddr, lpToRemove, params.multicall);
        const { netPtOut, netPtFromSwap } = res;
        return this.contract.metaCall.removeLiquiditySinglePt(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'removeLiquiditySingleSy', { netSyOut: BN; netSyFee: BN; priceImpact: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySingleSyStatic(marketAddr, lpToRemove, params.multicall);
        const { netSyOut } = res;
        return this.contract.metaCall.removeLiquiditySingleSy(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.multicall)),
            this.routerStaticCall.removeLiquiditySingleSyStatic(marketAddr, lpToRemove, params.multicall),
        ]);

        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { netOut: netTokenOut, output } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        return this.contract.metaCall.removeLiquiditySingleToken(params.receiver, marketAddr, lpToRemove, output, {
            ...res,
            intermediateSy,
            netSyFee,
            netTokenOut,
            ...params,
        });
    }

    async swapExactPtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'swapExactPtForSy', { netSyOut: BN; netSyFee: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.multicall);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactPtForSy(
            params.receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async swapPtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapPtForExactSy',
        { netPtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapPtForExactSyStatic(marketAddr, exactSyOut, params.multicall);
        const { netPtIn } = res;
        const approxParam = Router.guessInApproxParams(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactSy(
            params.receiver,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapSyForExactPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'swapSyForExactPt', { netSyIn: BN; netSyFee: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactPtStatic(marketAddr, exactPtOut, params.multicall);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactPt(
            params.receiver,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            { ...res, ...params }
        );
    }

    async swapExactTokenForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForPt',
        {
            netPtOut: BN;
            input: TokenInputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn(params.multicall));
        const overrides = {
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .swapExactBaseTokenForPtStatic(marketAddr, token, amount, params.multicall)
                .then(({ netPtOut, netSyFee }) => ({ netOut: netPtOut, netSyFee }))
        );

        const { netOut: netPtOut, input } = res;

        if (netPtOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', tokenIn, marketAddr);
        }

        return this.contract.metaCall.swapExactTokenForPt(
            params.receiver,
            marketAddr,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            input,
            { ...res, netPtOut, ...mergeParams({ overrides }, params) }
        );
    }

    async swapExactSyForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'swapExactSyForPt', { netPtOut: BN; netSyFee: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForPtStatic(marketAddr, exactSyIn, params.multicall);
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactSyForPt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            { ...res, ...params }
        );
    }

    async mintSyFromToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'mintSyFromToken',
        { netSyOut: BN; input: TokenInputStruct; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.chainId, this.networkConnection);
        }
        const syAddr = sy.address;
        const syEntity = sy; // force type here
        const tokenMintSyList = await sy.getTokensIn(params.multicall);
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            syEntity
                .previewDeposit(token, amount, params.multicall)
                .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
        );
        const { netOut: netSyOut, input } = res;

        if (netSyOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, syAddr);
        }

        return this.contract.metaCall.mintSyFromToken(
            params.receiver,
            syAddr,
            calcSlippedDownAmount(netSyOut, slippage),
            input,
            { ...res, netSyOut, ...params }
        );
    }

    async redeemSyToToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        netSyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'redeemSyToToken',
        { netTokenOut: BN; output: TokenOutputStruct; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.chainId, this.networkConnection);
        }
        const tokenRedeemSyList = await sy.getTokensOut(params.multicall);
        const res = await this.outputParams(sy.address, netSyIn, tokenOut, tokenRedeemSyList, slippage);

        const { output, netOut: netTokenOut } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', sy.address, tokenOut);
        }

        return this.contract.metaCall.redeemSyToToken(params.receiver, sy.address, netSyIn, output, {
            ...res,
            netTokenOut,
            ...params,
        });
    }

    async mintPyFromToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'mintPyFromToken',
        { netPyOut: BN; input: TokenInputStruct; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.chainId, this.networkConnection);
        }
        const ytAddr = yt.address;
        const sy = await yt.syEntity();
        const tokenMintSyList = await sy.getTokensIn(params.multicall);
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .mintPYFromBaseStatic(ytAddr, token, amount, params.multicall)
                .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
        );
        const { netOut: netPyOut, input } = res;

        if (netPyOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }

        return this.contract.metaCall.mintPyFromToken(
            params.receiver,
            ytAddr,
            calcSlippedDownAmount(netPyOut, slippage),
            input,
            { ...res, netPyOut, ...mergeParams({ overrides }, params) }
        );
    }

    async redeemPyToToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'redeemPyToToken',
        { netTokenOut: BN; kybercallData: KybercallData; output: TokenOutputStruct }
    > {
        const params = this.addExtraParams(_params);
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.chainId, this.networkConnection);
        }
        const ytAddr = yt.address;
        const getSyPromise = yt.syEntity(params.multicall);
        const [sy, tokenRedeemSyList, pyIndex] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.multicall)),
            yt.pyIndexCurrent(),
        ]);
        const res = await this.outputParams(
            sy.address,
            new PyIndex(pyIndex).assetToSy(netPyIn),
            tokenOut,
            tokenRedeemSyList,
            slippage
        );
        const { netOut: netTokenOut, output } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract.metaCall.redeemPyToToken(params.receiver, ytAddr, netPyIn, output, {
            ...res,
            netTokenOut,
            ...params,
        });
    }

    async swapExactSyForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForYt',
        { netYtOut: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForYtStatic(marketAddr, exactSyIn, params.multicall);
        const { netYtOut } = res;
        const approxParam = Router.guessOutApproxParams(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            { ...res, approxParam, ...params }
        );
    }

    async swapYtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapYtForExactSy',
        { netYtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapYtForExactSyStatic(marketAddr, exactSyOut, params.multicall);
        const { netYtIn } = res;
        const approxParam = Router.guessInApproxParams(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactSy(
            params.receiver,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netYtIn, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapExactPtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.multicall);
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.multicall)),
            this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.multicall),
        ]);
        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { output, netOut: netTokenOut } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract.metaCall.swapExactPtForToken(params.receiver, marketAddr, exactPtIn, output, {
            ...res,
            netTokenOut,
            intermediateSy,
            netSyFee,
            ...params,
        });
    }

    async swapExactYtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'swapExactYtForSy', { netSyOut: BN; netSyFee: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.multicall);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactYtForSy(
            params.receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async swapSyForExactYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'swapSyForExactYt', { netSyIn: BN; netSyFee: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactYtStatic(marketAddr, exactYtOut, params.multicall);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactYt(
            params.receiver,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            { ...res, ...params }
        );
    }

    async swapExactTokenForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForYt',
        {
            netYtOut: BN;
            input: TokenInputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity(params.multicall);
        const tokenMintSyList = await sy.getTokensIn(params.multicall);
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .swapExactBaseTokenForYtStatic(marketAddr, token, amount, params.multicall)
                .then(({ netYtOut, netSyFee }) => ({ netOut: netYtOut, netSyFee }))
        );

        const { netOut: netYtOut, input } = res;

        if (netYtOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        return this.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            marketAddr,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            input,
            { ...res, netYtOut, ...mergeParams({ overrides }, params) }
        );
    }

    async swapExactYtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.multicall);
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.multicall)),
            this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.multicall),
        ]);
        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { netOut: netTokenOut, output } = res;
        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract.metaCall.swapExactYtForToken(params.receiver, marketAddr, exactYtIn, output, {
            ...res,
            netTokenOut,
            intermediateSy,
            netSyFee,
            ...params,
        });
    }

    async swapExactYtForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForPt',
        {
            netPtOut: BN;
            totalPtSwapped: BN;
            netSyFee: BN;
            priceImpact: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForPtStatic(marketAddr, exactYtIn, this.multicall);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = Router.guessInApproxParams(totalPtSwapped, slippage);
        return this.contract.metaCall.swapExactYtForPt(
            params.receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netPtOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapExactPtForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForYt',
        {
            netYtOut: BN;
            totalPtToSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForYtStatic(marketAddr, exactPtIn, params.multicall);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(totalPtToSwap, slippage);
        return this.contract.metaCall.swapExactPtForYt(
            params.receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }
}
