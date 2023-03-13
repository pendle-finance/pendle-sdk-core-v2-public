import { PendleEntity } from '../PendleEntity';
import {
    IPRouterStatic,
    WrappedContract,
    MetaMethodType,
    ContractMetaMethod,
    MetaMethodExtraParams,
    mergeMetaMethodExtraParams as mergeParams,
    getRouterStatic,
} from '../../contracts';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants, ethers } from 'ethers';
import { MarketEntity } from '../MarketEntity';
import { SyEntity } from '../SyEntity';
import { YtEntity } from '../YtEntity';
import { NoRouteFoundError } from '../../errors';
import { AggregatorHelper } from './aggregatorHelper';
import {
    NATIVE_ADDRESS_0x00,
    Address,
    getContractAddresses,
    ChainId,
    RawTokenAmount,
    toArrayOfStructures,
    calcSlippedDownAmount,
    calcSlippedUpAmount,
    calcSlippedDownAmountSqrt,
} from '../../common';
import { BigNumber } from 'bignumber.js';

import {
    TokenOutput,
    RouterMetaMethodReturnType,
    RouterMetaMethodExtraParams,
    BaseRouterConfig,
    FixedRouterMetaMethodExtraParams,
    ApproxParamsStruct,
    IPAllAction,
    SwapData,
} from './types';

import { BaseRoute, RouteContext } from './route';

import {
    BaseZapInRoute,
    BaseZapInRouteData,
    AddLiquidityDualTokenAndPtRoute,
    AddLiquiditySingleTokenRoute,
    AddLiquiditySingleTokenKeepYtRoute,
    SwapExactTokenForPtRoute,
    SwapExactTokenForYtRoute,
    MintSyFromTokenRoute,
    MintPyFromTokenRoute,
} from './route/zapIn';

import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    RemoveLiquidityDualTokenAndPtRoute,
    RemoveLiquiditySingleTokenRoute,
    RedeemSyToTokenRoute,
    RedeemPyToTokenRoute,
    SwapExactPtForTokenRoute,
    SwapExactYtForTokenRoute,
} from './route/zapOut';

import { GasFeeEstimator } from './GasFeeEstimator';
import { RouterTransactionBundler } from './RouterTransactionBundler';

export abstract class BaseRouter extends PendleEntity {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly EPS = 1e-3;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: BaseRouter.MIN_AMOUNT,
        guessMax: BaseRouter.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 20,
        eps: new BigNumber(BaseRouter.EPS).shiftedBy(18).toFixed(0),
    };

    readonly routerStatic: WrappedContract<IPRouterStatic>;
    readonly aggregatorHelper: AggregatorHelper;
    readonly chainId: ChainId;
    readonly gasFeeEstimator: GasFeeEstimator;

    constructor(readonly address: Address, config: BaseRouterConfig) {
        super(address, { abi: IPAllActionABI, ...config });
        this.chainId = config.chainId;
        this.aggregatorHelper = config.aggregatorHelper;
        this.routerStatic = getRouterStatic(config);
        this.gasFeeEstimator = config.gasFeeEstimator ?? new GasFeeEstimator(this.provider!);
    }

    abstract findBestZapInRoute<ZapInRoute extends BaseZapInRoute<MetaMethodType, BaseZapInRouteData, ZapInRoute>>(
        routes: ZapInRoute[]
    ): Promise<ZapInRoute | undefined>;
    abstract findBestZapOutRoute<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(routes: ZapOutRoute[]): Promise<ZapOutRoute | undefined>;

    get provider() {
        return this.networkConnection.provider ?? this.networkConnection.signer.provider;
    }

    get contract() {
        return this._contract as WrappedContract<IPAllAction>;
    }

    override get entityConfig(): BaseRouterConfig {
        return { ...super.entityConfig, chainId: this.chainId, aggregatorHelper: this.aggregatorHelper };
    }

    protected get routerStaticCall() {
        return this.routerStatic.multicallStatic;
    }

    /**
     * @return {@link NATIVE_ADDRESS_0x00} if there is no PENDLE_SWAP address for {@link chainId}.
     * The pendleSwap contract address is returned otherwise.
     */
    getPendleSwapAddress(): Address {
        return getContractAddresses(this.chainId).PENDLE_SWAP ?? NATIVE_ADDRESS_0x00;
    }

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): FixedRouterMetaMethodExtraParams<T> {
        const superParams = super.getDefaultMetaMethodExtraParams<T>();
        const method = superParams.method;

        const baseResult = {
            ...superParams,
            receiver: ContractMetaMethod.utils.getContractSignerAddress,
            useBulk: 'auto',
            entityConfig: this.entityConfig,
            method: undefined,
            aggregatorReceiver: this.address,
        } as const;

        const forCallStatic = {
            ...baseResult,
            overrides: { ...superParams.overrides, gasPrice: undefined, gasLimit: undefined, value: undefined },
        };

        return {
            ...baseResult,
            method,
            forCallStatic,
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

    createRouteContext<T extends MetaMethodType, RouteType extends BaseRoute<T, RouteType>>({
        params,
        syEntity,
        slippage,
    }: {
        readonly params: FixedRouterMetaMethodExtraParams<T>;
        readonly syEntity: SyEntity;
        readonly slippage: number;
    }): RouteContext<T, RouteType> {
        return new RouteContext({
            router: this,
            syEntity,
            routerExtraParams: params,
            aggregatorSlippage: slippage,
        });
    }

    getApproxParamsToPullPt(guessAmountOut: BN, slippage: number): ApproxParamsStruct {
        return {
            ...BaseRouter.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountOut, 1 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountOut, 5 * slippage),
            guessOffchain: guessAmountOut,
            maxIteration: this.calcMaxIteration(slippage),
        };
    }

    getApproxParamsToPushPt(guessAmountIn: BN, slippage: number): ApproxParamsStruct {
        return {
            ...BaseRouter.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountIn, 5 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountIn, 1 * slippage),
            guessOffchain: guessAmountIn,
            maxIteration: this.calcMaxIteration(slippage),
        };
    }

    protected calcMaxIteration(slippage: number): number {
        const x = (6 * slippage) / BaseRouter.EPS;
        if (x <= 1) return 3;
        return Math.ceil(Math.log2(x)) + 3;
    }

    // bulk seller parameters for routing algorithm
    getBulkLimit(): BN {
        return ethers.utils.parseEther('10');
    }

    getBulkBuffer(): number {
        return 10 / 100;
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
            params.forCallStatic
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            syDesired,
            ptDesired,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
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
    ): RouterMetaMethodReturnType<
        T,
        'addLiquidityDualTokenAndPt',
        {
            netLpOut: BN;
            netTokenUsed: BN;
            netPtUsed: BN;
            route: AddLiquidityDualTokenAndPtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, AddLiquidityDualTokenAndPtRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new AddLiquidityDualTokenAndPtRoute(marketAddr, tokenIn, tokenDesired, ptDesired, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('add liquidity', tokenIn, marketAddr);
        }
        return bestRoute.buildCall();
    }

    async addLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        _params: MetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySinglePt',
        {
            netLpOut: BN;
            netPtToSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySinglePtStatic(marketAddr, netPtIn, params.forCallStatic);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = this.getApproxParamsToPushPt(netPtToSwap, slippage);
        return this.contract.metaCall.addLiquiditySinglePt(
            params.receiver,
            marketAddr,
            netPtIn,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
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
        {
            netLpOut: BN;
            netPtFromSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyStatic(marketAddr, netSyIn, params.forCallStatic);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = this.getApproxParamsToPullPt(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleSy(
            params.receiver,
            marketAddr,
            netSyIn,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            this.getApproxParamsToPullPt(netPtFromSwap, slippage),
            { ...res, approxParam, ...params }
        );
    }

    async addLiquiditySingleSyKeepYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleSyKeepYt',
        {
            netLpOut: BN;
            netYtOut: BN;
            netSyToPY: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyKeepYtStatic(
            marketAddr,
            netSyIn,
            params.forCallStatic
        );
        const { netLpOut, netYtOut } = res;

        return this.contract.metaCall.addLiquiditySingleSyKeepYt(
            params.receiver,
            marketAddr,
            netSyIn,
            // note: different slip down amount function
            calcSlippedDownAmountSqrt(netLpOut, slippage),
            calcSlippedDownAmountSqrt(netYtOut, slippage),
            { ...res, ...params }
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
        {
            netLpOut: BN;
            netPtFromSwap: BN;
            priceImpact: BN;
            netSyFee: BN;
            exchangeRateAfter: BN;
            route: AddLiquiditySingleTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, AddLiquiditySingleTokenRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();

        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new AddLiquiditySingleTokenRoute(marketAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );

        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('add liquidity', tokenIn, marketAddr);
        }
        return bestRoute.buildCall();
    }

    async addLiquiditySingleTokenKeepYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleTokenKeepYt',
        {
            netLpOut: BN;
            netYtOut: BN;
            netSyMinted: BN;
            netSyToPY: BN;
            route: AddLiquiditySingleTokenKeepYtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, AddLiquiditySingleTokenKeepYtRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();

        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new AddLiquiditySingleTokenKeepYtRoute(marketAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );

        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('add liquidity', tokenIn, marketAddr);
        }
        return bestRoute.buildCall();
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
            params.forCallStatic
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
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquidityDualTokenAndPt',
        {
            netPtOut: BN;
            intermediateSyAmount: BN;
            route: RemoveLiquidityDualTokenAndPtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }

        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, RemoveLiquidityDualTokenAndPtRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();

        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new RemoveLiquidityDualTokenAndPtRoute(marketAddr, lpToRemove, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );

        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('remove liquidity', marketAddr, tokenOut);
        }
        return bestRoute.buildCall();
    }

    async removeLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySinglePt',
        { netPtOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySinglePtStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netPtOut, netPtFromSwap } = res;
        return this.contract.metaCall.removeLiquiditySinglePt(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            this.getApproxParamsToPullPt(netPtFromSwap, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySingleSyStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
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
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            intermediateSyAmount: BN;
            route: RemoveLiquiditySingleTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, RemoveLiquiditySingleTokenRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new RemoveLiquiditySingleTokenRoute(marketAddr, lpToRemove, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }
        return bestRoute.buildCall();
    }

    async swapExactPtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.forCallStatic);
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
        { netPtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapPtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netPtIn } = res;
        const approxParam = this.getApproxParamsToPushPt(netPtIn, slippage);
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
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactPt',
        { netSyIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactPtStatic(marketAddr, exactPtOut, params.forCallStatic);
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
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            route: SwapExactTokenForPtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactTokenForPtRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForPtRoute(marketAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes);

        if (bestRoute === undefined) {
            const pt = await market.pt(params.forCallStatic);
            throw NoRouteFoundError.action('swap', tokenIn, pt);
        }
        return bestRoute.buildCall();
    }

    async swapExactSyForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForPt',
        { netPtOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForPtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactSyForPt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            this.getApproxParamsToPullPt(netPtOut, slippage),
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
        {
            netSyOut: BN;
            route: MintSyFromTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.entityConfig);
        }
        const syAddr = sy.address;
        const syEntity = sy; // force type here
        const routeContext = this.createRouteContext<T, MintSyFromTokenRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new MintSyFromTokenRoute(syAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('mint', tokenIn, syAddr);
        }
        return bestRoute.buildCall();
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
        {
            intermediateSyAmount: BN;
            route: RedeemSyToTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const syEntity = typeof sy === 'string' ? new SyEntity(sy, this.entityConfig) : sy;
        const syAddr = syEntity.address;
        const routeContext = this.createRouteContext<T, RedeemSyToTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new RedeemSyToTokenRoute(syAddr, BN.from(netSyIn), tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('redeem', syAddr, tokenOut);
        }
        return bestRoute.buildCall();
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
        {
            netPyOut: BN;
            route: MintPyFromTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.entityConfig);
        }
        const ytAddr = yt.address;
        const syEntity = await yt.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, MintPyFromTokenRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new MintPyFromTokenRoute(ytAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }
        return bestRoute.buildCall();
    }

    async mintPyFromSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountSyToMint: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'mintPyFromSy', { netPyOut: BN }> {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netPyOut = await this.routerStaticCall.mintPyFromSyStatic(ytAddr, amountSyToMint);
        return this.contract.metaCall.mintPyFromSy(
            params.receiver,
            ytAddr,
            amountSyToMint,
            calcSlippedDownAmount(netPyOut, slippage),
            { ...params, netPyOut }
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
        {
            intermediateSyAmount: BN;
            pyIndex: BN;
            route: RedeemPyToTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const ytAddr = ytEntity.address;
        const syEntity = await ytEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, RedeemPyToTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();

        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new RedeemPyToTokenRoute(ytEntity, BN.from(netPyIn), tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }
        return bestRoute.buildCall();
    }

    async redeemPyToSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountPyToRedeem: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T>
    ): RouterMetaMethodReturnType<T, 'redeemPyToSy', { netSyOut: BN }> {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netSyOut = await this.routerStaticCall.redeemPyToSyStatic(ytAddr, amountPyToRedeem);
        return this.contract.metaCall.redeemPyToSy(
            params.receiver,
            ytAddr,
            amountPyToRedeem,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...params, netSyOut }
        );
    }

    async swapExactSyForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForYt',
        { netYtOut: BN; netSyFee: BN; approxParam: ApproxParamsStruct; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForYtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netYtOut } = res;
        const approxParam = this.getApproxParamsToPullPt(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            this.getApproxParamsToPullPt(netYtOut, slippage),
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
        { netYtIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapYtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netYtIn } = res;
        const approxParam = this.getApproxParamsToPushPt(netYtIn, slippage);
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
            intermediateSyAmount: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            route: SwapExactPtForTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        // Type safe
        const marketEntity = market;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactPtForTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new SwapExactPtForTokenRoute(marketEntity, exactPtIn, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            throw NoRouteFoundError.action('swap', await market.pt(params.forCallStatic), tokenOut);
        }
        return bestRoute.buildCall();
    }

    async swapExactYtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.forCallStatic);
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
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactYt',
        { netSyIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactYtStatic(marketAddr, exactYtOut, params.forCallStatic);
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
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            route: SwapExactTokenForYtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactTokenForYtRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForYtRoute(marketAddr, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes);
        if (bestRoute === undefined) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt(params.forCallStatic));
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }
        return bestRoute.buildCall();
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
            intermediateSyAmount: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            route: SwapExactYtForTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketEntity = market; // type safe
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactYtForTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new SwapExactYtForTokenRoute(marketEntity, exactYtIn, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes);
        if (bestRoute === undefined) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt(params.forCallStatic));
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }
        return bestRoute.buildCall();
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
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForPtStatic(marketAddr, exactYtIn, params.forCallStatic);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = this.getApproxParamsToPushPt(totalPtSwapped, slippage);
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
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForYtStatic(marketAddr, exactPtIn, params.forCallStatic);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = this.getApproxParamsToPushPt(totalPtToSwap, slippage);
        return this.contract.metaCall.swapExactPtForYt(
            params.receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async redeemDueInterestAndRewards<T extends MetaMethodType>(
        redeemingSources: {
            sys?: (Address | SyEntity)[];
            yts?: (Address | YtEntity)[];
            markets?: (Address | MarketEntity)[];
        },
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'redeemDueInterestAndRewards', {}> {
        const params = this.addExtraParams(_params);
        const sys = redeemingSources.sys?.map(BaseRouter.extractAddress) ?? [];
        const yts = redeemingSources.yts?.map(BaseRouter.extractAddress) ?? [];
        const markets = redeemingSources.markets?.map(BaseRouter.extractAddress) ?? [];
        return this.contract.metaCall.redeemDueInterestAndRewards(params.receiver, sys, yts, markets, params);
    }

    /**
     * @see {@link RouterTransactionBundler}
     */
    createTransactionBundler(): RouterTransactionBundler {
        return new RouterTransactionBundler(this);
    }

    protected static extractAddress(addressOrEntity: Address | { address: Address }): Address {
        return typeof addressOrEntity === 'string' ? addressOrEntity : addressOrEntity.address;
    }

    async sellSys(
        tokenOut: Address,
        slippage: number,
        sysAndSyIns: { sys: Address[]; netSyIns: BigNumberish[] },
        params?: { receiver?: Address }
    ): Promise<TokenOutput[]>;
    async sellSys(
        tokenOut: Address,
        slippage: number,
        syTokenAmounts: RawTokenAmount<BigNumberish>[],
        params?: { receiver?: Address }
    ): Promise<TokenOutput[]>;
    async sellSys(
        tokenOut: Address,
        slippage: number,
        input: { sys: Address[]; netSyIns: BigNumberish[] } | RawTokenAmount<BigNumberish>[],
        params: { receiver?: Address } = {}
    ): Promise<TokenOutput[]> {
        const syTokenAmounts = Array.isArray(input)
            ? input
            : toArrayOfStructures({ token: input.sys, amount: input.netSyIns });
        return this.sellSysImpl(tokenOut, slippage, syTokenAmounts, params);
    }

    async sellTokens(
        tokenOut: Address,
        slippage: number,
        tokensAndTokensIn: { tokens: Address[]; netTokenIns: BigNumberish[] },
        params?: { receiver?: Address }
    ): Promise<SwapData[]>;
    async sellTokens(
        tokenOut: Address,
        slippage: number,
        tokenAmounts: RawTokenAmount<BigNumberish>[],
        params?: { receiver?: Address }
    ): Promise<SwapData[]>;
    async sellTokens(
        tokenOut: Address,
        slippage: number,
        input: { tokens: Address[]; netTokenIns: BigNumberish[] } | RawTokenAmount<BigNumberish>[],
        params: { receiver?: Address } = {}
    ): Promise<SwapData[]> {
        const tokenAmounts = Array.isArray(input)
            ? input
            : toArrayOfStructures({ token: input.tokens, amount: input.netTokenIns });
        return this.sellTokensImpl(tokenOut, slippage, tokenAmounts, params);
    }

    private async sellSysImpl(
        tokenOut: Address,
        slippage: number,
        syTokenAmounts: RawTokenAmount<BigNumberish>[],
        params: { receiver?: Address } = {}
    ): Promise<TokenOutput[]> {
        return await Promise.all(
            syTokenAmounts.map(async ({ token, amount }) => {
                const res = await this.redeemSyToToken(token, amount, tokenOut, slippage, {
                    aggregatorReceiver: params.receiver,
                    method: 'meta-method',
                });
                return (await res.data.route.buildTokenOutput())!;
            })
        );
    }

    private async sellTokensImpl(
        tokenOut: Address,
        slippage: number,
        tokenAmounts: RawTokenAmount<BigNumberish>[],
        params: { receiver?: Address } = {}
    ): Promise<SwapData[]> {
        const swapData = await Promise.all(
            tokenAmounts.map(async (tokenAmount) => {
                const res = await this.aggregatorHelper.makeCall(tokenAmount, tokenOut, slippage, {
                    aggregatorReceiver: params.receiver,
                });
                if (res === undefined) {
                    throw NoRouteFoundError.action('sell token', tokenAmount.token, tokenOut);
                }
                return res.createSwapData({ needScale: true });
            })
        );
        return swapData;
    }
}
