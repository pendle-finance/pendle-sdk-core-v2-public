import { PendleEntity } from '../PendleEntity';
import {
    IPRouterStatic,
    WrappedContract,
    MetaMethodType,
    ContractMetaMethod,
    MetaMethodExtraParams,
    mergeMetaMethodExtraParams as mergeParams,
    getRouterStatic,
    createContractObject,
    abis,
    typechain,
} from '../../contracts';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants } from 'ethers';
import { MarketEntity } from '../MarketEntity';
import { SyEntity } from '../SyEntity';
import { YtEntity } from '../YtEntity';
import { NoRouteFoundError, PendleSdkError, PendleSdkErrorParams } from '../../errors';
import {
    AggregatorHelper,
    SwapType,
    VoidAggregatorHelper,
    forceAggregatorHelperToCheckResult,
} from './aggregatorHelper';
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
    areSameAddresses,
    NoArgsCache,
} from '../../common';
import { BigNumber } from 'bignumber.js';

import {
    TokenOutput,
    RouterMetaMethodReturnType,
    RouterHelperMetaMethodReturnType,
    RouterMetaMethodExtraParams,
    MetaMethodForRouterMethod,
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
import * as zapInRoutes from './route/zapIn';
import * as liqMigrationRoutes from './route/liquidityMigration';

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
import * as zapOutRoutes from './route/zapOut';

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
    readonly aggregatorHelper: AggregatorHelper<true>;
    readonly chainId: ChainId;
    readonly gasFeeEstimator: GasFeeEstimator;
    readonly checkErrorOnSimulation: boolean;

    constructor(readonly address: Address, config: BaseRouterConfig) {
        super(address, { abi: IPAllActionABI, ...config });
        this.chainId = config.chainId;
        this.aggregatorHelper = forceAggregatorHelperToCheckResult(
            config.aggregatorHelper ?? new VoidAggregatorHelper()
        );
        this.routerStatic = getRouterStatic(config);
        this.gasFeeEstimator = config.gasFeeEstimator ?? new GasFeeEstimator(this.provider!);
        this.checkErrorOnSimulation = config.checkErrorOnSimulation ?? false;
    }

    @NoArgsCache
    getRouterHelper(): WrappedContract<typechain.PendleRouterHelper> {
        return createContractObject<typechain.PendleRouterHelper>(
            getContractAddresses(this.chainId).ROUTER_HELPER,
            abis.PendleRouterHelperABI,
            this.entityConfig
        );
    }

    abstract findBestZapInRoute<ZapInRoute extends BaseZapInRoute<MetaMethodType, BaseZapInRouteData, ZapInRoute>>(
        routes: ZapInRoute[]
    ): Promise<ZapInRoute>;
    abstract findBestZapOutRoute<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(routes: ZapOutRoute[]): Promise<ZapOutRoute>;
    abstract findBestLiquidityMigrationRoute<
        LiquidityMigrationRoute extends liqMigrationRoutes.BaseLiquidityMigrationFixTokenRedeemSyRoute<any, any, any>
    >(routes: LiquidityMigrationRoute[]): Promise<LiquidityMigrationRoute>;

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
     * Get pendleSwap address for a given swapType and chainId
     * @param swapType the swapType of the action
     *
     * @return {@link NATIVE_ADDRESS_0x00} if:
     *  - there is no PENDLE_SWAP address for {@link chainId}.
     *  - or the swapType is not KYBERSWAP or ONE_INCH
     *
     * The pendleSwap contract address is returned otherwise.
     */
    getPendleSwapAddress(swapType: SwapType): Address {
        if (swapType !== SwapType.KYBERSWAP && swapType !== SwapType.ONE_INCH) {
            return NATIVE_ADDRESS_0x00;
        }
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

    static readonly BULK_SELLER_NO_LIMIT = BN.from(-1);
    // bulk seller parameters for routing algorithm

    getBulkLimit(): BN {
        return BaseRouter.BULK_SELLER_NO_LIMIT;
    }

    getBulkBuffer(): number {
        return 3 / 100;
    }

    async addLiquidityDualSyAndPt<T extends MetaMethodType = 'send'>(
        market: Address | MarketEntity,
        syDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquidityDualSyAndPt',
        { netLpOut: BN; netSyUsed: BN; netPtUsed: BN; minLpOut: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquidityDualSyAndPtStatic(
            marketAddr,
            syDesired,
            ptDesired,
            params.forCallStatic
        );
        const { netLpOut } = res;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            syDesired,
            ptDesired,
            minLpOut,
            { ..._params, ...res, minLpOut }
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
        zapInRoutes.AddLiquidityDualTokenAndPtRouteData & {
            route: AddLiquidityDualTokenAndPtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketEntity = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const marketAddr = marketEntity.address;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, AddLiquidityDualTokenAndPtRoute<T>>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new AddLiquidityDualTokenAndPtRoute(marketEntity, tokenIn, tokenDesired, ptDesired, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('add liquidity', tokenIn, marketAddr, { cause })
        );
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
            netSyFromSwap: BN;
            approxParam: ApproxParamsStruct;
            minLpOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySinglePtStatic(marketAddr, netPtIn, params.forCallStatic);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = this.getApproxParamsToPushPt(netPtToSwap, slippage);
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function
        return this.contract.metaCall.addLiquiditySinglePt(
            params.receiver,
            marketAddr,
            netPtIn,
            minLpOut,
            approxParam,
            { ...res, ...params, approxParam, minLpOut }
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
            netSyToSwap: BN;
            approxParam: ApproxParamsStruct;
            minLpOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyStatic(marketAddr, netSyIn, params.forCallStatic);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = this.getApproxParamsToPullPt(netPtFromSwap, slippage);
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function

        return this.contract.metaCall.addLiquiditySingleSy(
            params.receiver,
            marketAddr,
            netSyIn,
            minLpOut,
            this.getApproxParamsToPullPt(netPtFromSwap, slippage),
            { ...res, ...params, approxParam, minLpOut }
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
            minLpOut: BN;
            minYtOut: BN;
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

        // note: different slip down amount function
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);
        const minYtOut = calcSlippedDownAmountSqrt(netYtOut, slippage);

        return this.contract.metaCall.addLiquiditySingleSyKeepYt(
            params.receiver,
            marketAddr,
            netSyIn,
            minLpOut,
            minYtOut,
            { ...res, ...params, minLpOut, minYtOut }
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
        zapInRoutes.AddLiquiditySingleTokenRouteData & {
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

        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('add liquidity', tokenIn, marketAddr, { cause })
        );
        return bestRoute.buildCall();
    }

    /**
     * @remarks
     * ### `PendleRouterHelper` patch
     * A small bug on the contract side: `addLiquiditySingleTokenKeepYt` method
     * of `router` contract is **not PAYABLE**.
     *
     * A small patch for this is to use the function
     * `addLiquiditySingleTokenKeepYtWithEth` from the new contract
     * `PendleRouterHelper`.
     *
     * Hence the _weird_ return type. :prayge:
     *
     * @privateRemarks
     * #### More explanation on the return type
     * The return type is slightly complex (it is actually `Promise<Promise<...>>`, as
     * the type alias {@link RouterMetaMethodReturnType}/{@link RouterHelperMetaMethodReturnType}
     * is also `Promise`.
     *
     * We also can not add `Awaited` like this `Promise<Awaited<A> | Awaited<B>>`. That type
     * will erase the generic type `T` from the return type.
     *
     * Good thing is that `Awaited<Promise<Promise<X>>>` is `X`.
     */
    async addLiquiditySingleTokenKeepYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): Promise<
        | RouterMetaMethodReturnType<
              T,
              'addLiquiditySingleTokenKeepYt',
              zapInRoutes.AddLiquiditySingleTokenKeepYtRouteData & {
                  route: AddLiquiditySingleTokenKeepYtRoute<T>;
              }
          >
        | RouterHelperMetaMethodReturnType<
              T,
              'addLiquiditySingleTokenKeepYtWithEth',
              zapInRoutes.AddLiquiditySingleTokenKeepYtRouteData & {
                  route: AddLiquiditySingleTokenKeepYtRoute<T>;
              }
          >
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

        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('add liquidity', tokenIn, marketAddr, { cause })
        );
        return bestRoute.buildCall();
    }

    async removeLiquidityDualSyAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquidityDualSyAndPt',
        {
            netSyOut: BN;
            netPtOut: BN;
            minSyOut: BN;
            minPtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualSyAndPtStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netSyOut, netPtOut } = res;
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        return this.contract.metaCall.removeLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            minSyOut,
            minPtOut,
            { ...res, ...params, minSyOut, minPtOut }
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
        zapOutRoutes.RemoveLiquidityDualTokenAndPtRouteIntermediateData & {
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

        const bestRoute = await this.findBestZapOutRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('remove liquidity', marketAddr, tokenOut, { cause })
        );

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
        {
            netPtOut: BN;
            netPtFromSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            netSyFromBurn: BN;
            netPtFromBurn: BN;
            minPtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySinglePtStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netPtOut, netPtFromSwap } = res;
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        return this.contract.metaCall.removeLiquiditySinglePt(
            params.receiver,
            marketAddr,
            lpToRemove,
            minPtOut,
            this.getApproxParamsToPullPt(netPtFromSwap, slippage),
            { ...res, ...params, minPtOut }
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
        {
            netSyOut: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            netSyFromBurn: BN;
            netPtFromBurn: BN;
            netSyFromSwap: BN;
            minSyOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySingleSyStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netSyOut } = res;
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        return this.contract.metaCall.removeLiquiditySingleSy(params.receiver, marketAddr, lpToRemove, minSyOut, {
            ...res,
            ...params,
            minSyOut,
        });
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
        zapOutRoutes.RemoveLiquiditySingleTokenRouteIntermediateData & {
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
        const bestRoute = await this.findBestZapOutRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('zap out', marketAddr, tokenOut, { cause })
        );
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
        {
            netSyOut: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            minSyOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.forCallStatic);
        const { netSyOut } = res;
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        return this.contract.metaCall.swapExactPtForSy(params.receiver, marketAddr, exactPtIn, minSyOut, {
            ...res,
            ...params,
            minSyOut,
        });
    }

    async swapPtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapPtForExactSy',
        {
            netPtIn: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
            maxPtIn: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapPtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netPtIn } = res;
        const approxParam = this.getApproxParamsToPushPt(netPtIn, slippage);
        const maxPtIn = calcSlippedUpAmount(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactSy(params.receiver, marketAddr, exactSyOut, maxPtIn, approxParam, {
            ...res,
            ...params,
            approxParam,
            maxPtIn,
        });
    }

    async swapSyForExactPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactPt',
        {
            netSyIn: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            maxSyIn: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactPtStatic(marketAddr, exactPtOut, params.forCallStatic);
        const { netSyIn } = res;
        const maxSyIn = calcSlippedUpAmount(netSyIn, slippage);
        return this.contract.metaCall.swapSyForExactPt(params.receiver, marketAddr, exactPtOut, maxSyIn, {
            ...res,
            ...params,
            maxSyIn,
        });
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
        zapInRoutes.SwapExactTokenForPtRouteData & {
            route: SwapExactTokenForPtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketEntity = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactTokenForPtRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForPtRoute(marketEntity.address, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', tokenIn, await marketEntity.pt(), { cause })
        );

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
        {
            netPtOut: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            minPtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForPtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netPtOut } = res;
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        return this.contract.metaCall.swapExactSyForPt(
            params.receiver,
            marketAddr,
            exactSyIn,
            minPtOut,
            this.getApproxParamsToPullPt(netPtOut, slippage),
            { ...res, ...params, minPtOut }
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
        zapInRoutes.MintSyFromTokenRouteData & {
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
        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('mint', tokenIn, syAddr, { cause })
        );
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
        zapOutRoutes.RedeemSyToTokenRouteIntermediateData & {
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
        const bestRoute = await this.findBestZapOutRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('redeem', syAddr, tokenOut, { cause })
        );
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
        zapInRoutes.MintPyFromTokenRouteData & {
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
        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('mint', tokenIn, ytAddr, { cause })
        );
        return bestRoute.buildCall();
    }

    async mintPyFromSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountSyToMint: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'mintPyFromSy', { netPyOut: BN; minPyOut: BN }> {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netPyOut = await this.routerStaticCall.mintPyFromSyStatic(ytAddr, amountSyToMint);
        const minPyOut = calcSlippedDownAmount(netPyOut, slippage);
        return this.contract.metaCall.mintPyFromSy(params.receiver, ytAddr, amountSyToMint, minPyOut, {
            ...params,
            netPyOut,
            minPyOut,
        });
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
        zapOutRoutes.RedeemPyToTokenRouteIntermediateData & {
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
        const bestRoute = await this.findBestZapOutRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('redeem', ytAddr, tokenOut, { cause })
        );
        return bestRoute.buildCall();
    }

    async redeemPyToSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountPyToRedeem: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T>
    ): RouterMetaMethodReturnType<T, 'redeemPyToSy', { netSyOut: BN; minSyOut: BN }> {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netSyOut = await this.routerStaticCall.redeemPyToSyStatic(ytAddr, amountPyToRedeem);
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        return this.contract.metaCall.redeemPyToSy(params.receiver, ytAddr, amountPyToRedeem, minSyOut, {
            ...params,
            netSyOut,
            minSyOut,
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
        {
            netYtOut: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
            minYtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForYtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netYtOut } = res;
        const approxParam = this.getApproxParamsToPullPt(netYtOut, slippage);
        const minYtOut = calcSlippedDownAmount(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            params.receiver,
            marketAddr,
            exactSyIn,
            minYtOut,
            this.getApproxParamsToPullPt(netYtOut, slippage),
            { ...res, ...params, approxParam, minYtOut }
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
        {
            netYtIn: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
            maxYtIn: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapYtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netYtIn } = res;
        const approxParam = this.getApproxParamsToPushPt(netYtIn, slippage);
        const maxYtIn = calcSlippedUpAmount(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactSy(params.receiver, marketAddr, exactSyOut, maxYtIn, approxParam, {
            ...res,
            ...params,
            approxParam,
            maxYtIn,
        });
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
        zapOutRoutes.SwapExactPtForTokenRouteIntermediateData & {
            route: SwapExactPtForTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketEntity = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactPtForTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new SwapExactPtForTokenRoute(marketEntity, exactPtIn, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', await marketEntity.pt(params.forCallStatic), tokenOut, { cause })
        );
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
        {
            netSyOut: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            netSyOwedInt: BN;
            netPYToRepaySyOwedInt: BN;
            netPYToRedeemSyOutInt: BN;
            minSyOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.forCallStatic);
        const { netSyOut } = res;
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        return this.contract.metaCall.swapExactYtForSy(params.receiver, marketAddr, exactYtIn, minSyOut, {
            ...res,
            ...params,
            minSyOut,
        });
    }

    async swapSyForExactYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactYt',
        {
            netSyIn: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            netSyReceivedInt: BN;
            totalSyNeedInt: BN;
            maxSyIn: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactYtStatic(marketAddr, exactYtOut, params.forCallStatic);
        const { netSyIn } = res;
        const maxSyIn = calcSlippedUpAmount(netSyIn, slippage);
        return this.contract.metaCall.swapSyForExactYt(params.receiver, marketAddr, exactYtOut, maxSyIn, {
            ...res,
            ...params,
            maxSyIn,
        });
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
        zapInRoutes.SwapExactTokenForYtRouteData & {
            route: SwapExactTokenForYtRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketEntity = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactTokenForYtRoute<T>>({ params, syEntity, slippage });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForYtRoute(marketEntity.address, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', tokenIn, await marketEntity.yt(params.forCallStatic), { cause })
        );
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
        zapOutRoutes.SwapExactYtForTokenRouteIntermediateData & {
            route: SwapExactYtForTokenRoute<T>;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketEntity = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<T, SwapExactYtForTokenRoute<T>>({ params, syEntity, slippage });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new SwapExactYtForTokenRoute(marketEntity, exactYtIn, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', await marketEntity.yt(params.forCallStatic), tokenOut, { cause })
        );
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
            minPtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForPtStatic(marketAddr, exactYtIn, params.forCallStatic);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = this.getApproxParamsToPushPt(totalPtSwapped, slippage);
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        return this.contract.metaCall.swapExactYtForPt(params.receiver, marketAddr, exactYtIn, minPtOut, approxParam, {
            ...res,
            approxParam,
            ...params,
            minPtOut,
        });
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
            minYtOut: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForYtStatic(marketAddr, exactPtIn, params.forCallStatic);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = this.getApproxParamsToPushPt(totalPtToSwap, slippage);
        const minYtOut = calcSlippedDownAmount(netYtOut, slippage);
        return this.contract.metaCall.swapExactPtForYt(params.receiver, marketAddr, exactPtIn, minYtOut, approxParam, {
            ...res,
            ...params,
            approxParam,
            minYtOut,
        });
    }

    async redeemDueInterestAndRewards<T extends MetaMethodType>(
        redeemingSources: {
            sys?: (Address | SyEntity)[];
            yts?: (Address | YtEntity)[];
            markets?: (Address | MarketEntity)[];
        },
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'redeemDueInterestAndRewards'> {
        const params = this.addExtraParams(_params);
        const sys = redeemingSources.sys?.map(BaseRouter.extractAddress) ?? [];
        const yts = redeemingSources.yts?.map(BaseRouter.extractAddress) ?? [];
        const markets = redeemingSources.markets?.map(BaseRouter.extractAddress) ?? [];
        return this.contract.metaCall.redeemDueInterestAndRewards(params.receiver, sys, yts, markets, params);
    }

    async migrateLiquidityViaSharedSy<T extends MetaMethodType>(
        srcMarket: Address | MarketEntity,
        netLpToMigrate: BigNumberish,
        dstMarket: Address | MarketEntity,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> & { redeemRewards?: boolean } = {}
    ): RouterHelperMetaMethodReturnType<
        T,
        'transferLiquiditySameSyNormal',
        {
            removeLiquidityMetaMethod: MetaMethodForRouterMethod<BaseRouter['removeLiquiditySingleSy']>;
            addLiquidityMetaMethod: MetaMethodForRouterMethod<BaseRouter['addLiquiditySingleSy']>;
        }
    > {
        const doRedeemRewards = _params.redeemRewards ?? false;
        const params = this.addExtraParams(_params);
        srcMarket = typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        dstMarket = typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSy, dstSy] = await Promise.all([srcMarket.sy(), dstMarket.sy()]);
        if (!areSameAddresses(srcSy, dstSy)) {
            throw new PendleSdkError('Source and destination market should share the same SY');
        }
        const removeLiquidityMetaMethod = await this.removeLiquiditySingleSy(srcMarket, netLpToMigrate, slippage, {
            ...params,
            method: 'meta-method',
        });
        const netSyToZapIn = removeLiquidityMetaMethod.data.netSyOut;
        const addLiquidityMetaMethod = await this.addLiquiditySingleSy(dstMarket, netSyToZapIn, slippage, {
            ...params,
            method: 'meta-method',
        });
        const netLpOut = addLiquidityMetaMethod.data.netLpOut;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);

        const routerHelper = this.getRouterHelper();
        return routerHelper.metaCall.transferLiquiditySameSyNormal(
            {
                market: srcMarket.address,
                netLpToRemove: netLpToMigrate,
                doRedeemRewards,
            },
            {
                market: dstMarket.address,
                minLpOut,
                guessNetSyIn: netSyToZapIn,
                guessPtReceivedFromSy: addLiquidityMetaMethod.data.approxParam,
            },
            { ...params, removeLiquidityMetaMethod, addLiquidityMetaMethod }
        );
    }

    async migrateLiquidityViaSharedSyKeepYt<T extends MetaMethodType>(
        srcMarket: Address | MarketEntity,
        netLpToMigrate: BigNumberish,
        dstMarket: Address | MarketEntity,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> & { redeemRewards?: boolean } = {}
    ): RouterHelperMetaMethodReturnType<
        T,
        'transferLiquiditySameSyKeepYt',
        {
            removeLiquidityMetaMethod: MetaMethodForRouterMethod<BaseRouter['removeLiquiditySingleSy']>;
            addLiquidityMetaMethod: MetaMethodForRouterMethod<BaseRouter['addLiquiditySingleSyKeepYt']>;
        }
    > {
        const doRedeemRewards = _params.redeemRewards ?? false;
        const params = this.addExtraParams(_params);
        srcMarket = typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        dstMarket = typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSy, dstSy] = await Promise.all([srcMarket.sy(), dstMarket.sy()]);
        if (!areSameAddresses(srcSy, dstSy)) {
            throw new PendleSdkError('Source and destination market should share the same SY');
        }
        const removeLiquidityMetaMethod = await this.removeLiquiditySingleSy(srcMarket, netLpToMigrate, slippage, {
            ...params,
            method: 'meta-method',
        });
        const netSyToZapIn = removeLiquidityMetaMethod.data.netSyOut;
        const addLiquidityMetaMethod = await this.addLiquiditySingleSyKeepYt(dstMarket, netSyToZapIn, slippage, {
            ...params,
            method: 'meta-method',
        });
        const netLpOut = addLiquidityMetaMethod.data.netLpOut;
        const netYtOut = addLiquidityMetaMethod.data.netYtOut;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);
        const minYtOut = calcSlippedDownAmountSqrt(netYtOut, slippage);

        const routerHelper = this.getRouterHelper();
        return routerHelper.metaCall.transferLiquiditySameSyKeepYt(
            {
                market: srcMarket.address,
                netLpToRemove: netLpToMigrate,
                doRedeemRewards,
            },
            {
                market: dstMarket.address,
                minLpOut,
                minYtOut,
            },
            { ...params, removeLiquidityMetaMethod, addLiquidityMetaMethod }
        );
    }

    async migrateLiquidityViaTokenRedeemSy<T extends MetaMethodType>(
        srcMarket: Address | MarketEntity,
        netLpToMigrate: BigNumberish,
        dstMarket: Address | MarketEntity,
        tokenRedeemSrcSy: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> & { redeemRewards?: boolean } = {}
    ): RouterHelperMetaMethodReturnType<
        T,
        'transferLiquidityDifferentSyNormal',
        {
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute<T>;
            addLiquidityRoute: AddLiquiditySingleTokenRoute<T>;
            route: liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyRoute<T>;
        }
    > {
        const redeemRewards = _params.redeemRewards ?? false;
        const params = this.addExtraParams(_params);
        const srcMarketEntity =
            typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        const dstMarketEntity =
            typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSyEntity, dstSyEntity] = await Promise.all([
            srcMarketEntity.syEntity({ entityConfig: this.entityConfig }),
            dstMarketEntity.syEntity({ entityConfig: this.entityConfig }),
        ]);

        const removeLiqContext = this.createRouteContext<
            T,
            liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>
        >({
            params,
            syEntity: srcSyEntity,
            slippage,
        });
        const addLiqContext = this.createRouteContext<T, AddLiquiditySingleTokenRoute<T>>({
            params,
            syEntity: dstSyEntity,
            slippage,
        });

        const [srcTokenRedeemSyList, dstTokenMintSyList] = await Promise.all([
            removeLiqContext.getTokensMintSy(),
            addLiqContext.getTokensRedeemSy(),
        ]);

        if (!srcTokenRedeemSyList.includes(tokenRedeemSrcSy)) {
            throw new PendleSdkError('A token redeem Sy from the source market should be used.');
        }

        const liquidityMigrationContext = this.createRouteContext<
            T,
            liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyRoute<T>
        >({
            params,
            syEntity: srcSyEntity, // This one does not matter tho
            slippage,
        });

        const removeLiquidityRoute = new liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper(
            srcMarketEntity.address,
            netLpToMigrate,
            tokenRedeemSrcSy,
            slippage,
            { context: removeLiqContext, tokenRedeemSy: tokenRedeemSrcSy, redeemRewards }
        );

        const routes = dstTokenMintSyList.map(
            (dstTokenMintSy) =>
                new liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyRoute({
                    removeLiquidityRoute,
                    context: liquidityMigrationContext,
                    redeemRewards,
                    slippage,
                    addLiquidityRouteConfig: {
                        destinationMarket: dstMarketEntity.address,
                        params: {
                            context: addLiqContext,
                            tokenMintSy: dstTokenMintSy,
                        },
                    },
                })
        );

        const route = await this.findBestLiquidityMigrationRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, {
                cause,
            })
        );
        return route.buildCall();
    }

    async migrateLiquidityViaTokenRedeemSyKeepYt<T extends MetaMethodType>(
        srcMarket: Address | MarketEntity,
        netLpToMigrate: BigNumberish,
        dstMarket: Address | MarketEntity,
        tokenRedeemSrcSy: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> & { redeemRewards?: boolean } = {}
    ): RouterHelperMetaMethodReturnType<
        T,
        'transferLiquidityDifferentSyKeepYt',
        {
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute<T>;
            addLiquidityRoute: AddLiquiditySingleTokenKeepYtRoute<T>;
            route: liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>;
        }
    > {
        const redeemRewards = _params.redeemRewards ?? false;
        const params = this.addExtraParams(_params);
        const srcMarketEntity =
            typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        const dstMarketEntity =
            typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSyEntity, dstSyEntity] = await Promise.all([
            srcMarketEntity.syEntity({
                entityConfig: this.entityConfig,
            }),
            dstMarketEntity.syEntity({
                entityConfig: this.entityConfig,
            }),
        ]);

        const removeLiqContext = this.createRouteContext<
            T,
            liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>
        >({
            params,
            syEntity: srcSyEntity,
            slippage,
        });
        const addLiqContext = this.createRouteContext<T, AddLiquiditySingleTokenKeepYtRoute<T>>({
            params,
            syEntity: dstSyEntity,
            slippage,
        });

        const [srcTokenRedeemSyList, dstTokenMintSyList] = await Promise.all([
            removeLiqContext.getTokensMintSy(),
            addLiqContext.getTokensRedeemSy(),
        ]);

        if (!srcTokenRedeemSyList.includes(tokenRedeemSrcSy)) {
            throw new PendleSdkError('A token redeem Sy from the source market should be used.');
        }

        const liquidityMigrationContext = this.createRouteContext<
            T,
            liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>
        >({
            params,
            syEntity: srcSyEntity, // This one does not matter tho
            slippage,
        });

        const removeLiquidityRoute = new liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper(
            srcMarketEntity.address,
            netLpToMigrate,
            tokenRedeemSrcSy,
            slippage,
            { context: removeLiqContext, tokenRedeemSy: tokenRedeemSrcSy, redeemRewards }
        );

        const routes = dstTokenMintSyList.map(
            (dstTokenMintSy) =>
                new liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyKeepYtRoute({
                    removeLiquidityRoute,
                    context: liquidityMigrationContext,
                    redeemRewards,
                    slippage,
                    addLiquidityRouteConfig: {
                        destinationMarket: dstMarketEntity.address,
                        params: {
                            context: addLiqContext,
                            tokenMintSy: dstTokenMintSy,
                        },
                    },
                })
        );

        const route = await this.findBestLiquidityMigrationRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, {
                cause,
            })
        );
        return route.buildCall();
    }

    /**
     * @see {@link RouterTransactionBundler}
     */
    createTransactionBundler(): RouterTransactionBundler {
        return new RouterTransactionBundler(this);
    }

    protected static extractAddress(this: void, addressOrEntity: Address | { address: Address }): Address {
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
        return Promise.all(
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
                try {
                    const res = await this.aggregatorHelper.makeCall(tokenAmount, tokenOut, slippage, {
                        aggregatorReceiver: params.receiver,
                        needScale: false,
                    });
                    return res.createSwapData({ needScale: false });
                } catch (cause: unknown) {
                    return this.throwNoRouteFoundError('sell token', tokenAmount.token, tokenOut, { cause });
                }
            })
        );
        return swapData;
    }

    protected async throwNoRouteFoundError(
        actionName: string,
        from: Address,
        to: Address,
        params?: PendleSdkErrorParams
    ): Promise<never> {
        throw new NoRouteFoundError(actionName, from, to, params);
    }
}
