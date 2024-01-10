import { PendleEntity } from '../PendleEntity';
import {
    WrappedContract,
    MetaMethodType,
    ContractMetaMethod,
    MetaMethodExtraParams,
    mergeMetaMethodExtraParams as mergeParams,
    createContractObject,
    abis,
    typechain,
    mergeMetaMethodExtraParams,
} from '../../contracts';
import { abi as IPAllActionV3ABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllActionV3.sol/IPAllActionV3.json';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { MarketEntity } from '../MarketEntity';
import { SyEntity } from '../SyEntity';
import { YtEntity } from '../YtEntity';
import { NoRouteFoundError, PendleSdkError, PendleSdkErrorParams } from '../../errors';
import {
    AggregatorHelper,
    SwapType,
    VoidAggregatorHelper,
    forceAggregatorHelperToCheckResult,
    BatchAggregatorHelper,
} from './aggregatorHelper';
import {
    NATIVE_ADDRESS_0x00,
    Address,
    toAddress,
    getContractAddresses,
    ChainId,
    RawTokenAmount,
    toArrayOfStructures,
    calcSlippedDownAmount,
    calcSlippedDownAmountSqrt,
    areSameAddresses,
    NoArgsCache,
    bnMax,
} from '../../common';

import {
    TokenOutput,
    RouterMetaMethodReturnType,
    RouterHelperMetaMethodReturnType,
    RouterMetaMethodExtraParams,
    MetaMethodForRouterMethod,
    BaseRouterConfig,
    FixedRouterMetaMethodExtraParams,
    ApproxParamsStruct,
    IPAllActionV3,
    SwapData,
    TokenInput,
} from './types';
import * as routerTypes from './types';

import * as routeMod from './route';
import * as routeDef from './RouterMethodRouteDefinition';
import { Route } from './route';
import { BaseRoute, RouteContext } from './route';
import { txOverridesValueFromTokenInput } from './route/helper';
import {
    BaseZapInRoute,
    BaseZapInRouteData,
    AddLiquiditySingleTokenRoute,
    AddLiquiditySingleTokenKeepYtRoute,
} from './route/zapIn';
import * as liqMigrationRoutes from './route/liquidityMigration';

import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, RemoveLiquiditySingleTokenRoute } from './route/zapOut';

import { GasFeeEstimator } from './GasFeeEstimator';
import { RouterTransactionBundler } from './RouterTransactionBundler';

import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as limitOrder from './limitOrder';
import * as EE from 'eventemitter3';
import * as routerComponents from './components';

export abstract class BaseRouter extends PendleEntity {
    readonly chainId: ChainId;
    readonly checkErrorOnSimulation: boolean;
    readonly limitOrderMatcher: limitOrder.LimitOrderMatcher;
    readonly events = new EE.EventEmitter<routerTypes.RouterEvents, BaseRouter>();

    // components
    readonly gasFeeEstimator: GasFeeEstimator;
    readonly aggregatorHelper: AggregatorHelper<true>;
    readonly tokenAmountConverter: routerComponents.TokenAmountConverter;
    readonly optimalOutputRouteSelector: routerComponents.OptimalOutputRouteSelector;
    readonly limitOrderRouteSelector: routerComponents.LimitOrderRouteSelector;
    readonly approxParamsGenerator: routerComponents.ApproxParamsGenerator;

    constructor(
        readonly address: Address,
        config: BaseRouterConfig
    ) {
        super(address, { abi: IPAllActionV3ABI, ...config });
        this.chainId = config.chainId;
        this.aggregatorHelper = BatchAggregatorHelper.create(
            forceAggregatorHelperToCheckResult(config.aggregatorHelper ?? new VoidAggregatorHelper())
        );
        this.gasFeeEstimator = config.gasFeeEstimator ?? new GasFeeEstimator(this.provider!);
        this.checkErrorOnSimulation = config.checkErrorOnSimulation ?? false;
        this.limitOrderMatcher = config.limitOrderMatcher ?? limitOrder.VoidLimitOrderMatcher.INSTANCE;
        this.tokenAmountConverter =
            config.tokenAmountConverter ?? routerComponents.tokenAmountConverterViaAggregatorHelper;
        this.optimalOutputRouteSelector =
            config.optimalOutputRouteSelector ?? routerComponents.optimalOutputRouteSelectorWithGasAccounted;
        this.limitOrderRouteSelector =
            config.limitOrderRouteSelector ?? routerComponents.limitOrderRouteSelectorWithFallback;
        this.approxParamsGenerator = config.approxParamsGenerator ?? routerComponents.defaultApproxParamsGenerator;
    }

    @NoArgsCache
    getRouterHelper(): WrappedContract<typechain.PendleRouterHelper> {
        return createContractObject<typechain.PendleRouterHelper>(
            getContractAddresses(this.chainId).ROUTER_HELPER,
            abis.PendleRouterHelperABI,
            this.entityConfig
        );
    }

    async getSignerAddress(): Promise<Address | undefined> {
        const signerAddress = this.networkConnection.signer?.getAddress()?.then(toAddress);
        if (signerAddress === undefined) return undefined;
        return signerAddress;
    }

    /**
     * @deprecated This is now only kept for the migrate liquidity methods.
     * For other methods, custom {@link BaseRouter#optimalOutputRouteSelector} can be passed in.
     * @internal
     */
    abstract findBestZapInRoute<ZapInRoute extends BaseZapInRoute<BaseZapInRouteData, ZapInRoute>>(
        routes: ZapInRoute[]
    ): Promise<ZapInRoute>;
    /**
     * @deprecated This is now only kept for the migrate liquidity methods.
     * For other methods, custom {@link BaseRouter#optimalOutputRouteSelector} can be passed in.
     * @internal
     */
    abstract findBestZapOutRoute<ZapOutRoute extends BaseZapOutRoute<BaseZapOutRouteIntermediateData, ZapOutRoute>>(
        routes: ZapOutRoute[]
    ): Promise<ZapOutRoute>;
    /**
     * @deprecated This is now only kept for the migrate liquidity methods.
     * For other methods, custom {@link BaseRouter#optimalOutputRouteSelector} can be passed in.
     * @internal
     */
    abstract findBestLiquidityMigrationRoute<
        LiquidityMigrationRoute extends liqMigrationRoutes.BaseLiquidityMigrationFixTokenRedeemSyRoute<any, any>,
    >(routes: LiquidityMigrationRoute[]): Promise<LiquidityMigrationRoute>;

    get provider() {
        return this.networkConnection.provider ?? this.networkConnection.signer.provider;
    }

    get contract() {
        return this._contract as WrappedContract<IPAllActionV3>;
    }

    override get entityConfig(): BaseRouterConfig {
        return { ...super.entityConfig, chainId: this.chainId, aggregatorHelper: this.aggregatorHelper };
    }

    async getMarketStaticMathWithParams(
        market: Address | MarketEntity,
        params: FixedRouterMetaMethodExtraParams<MetaMethodType> & {
            pyIndex?: offchainMath.PyIndex;
            blockTimestamp?: number;
        }
    ) {
        market = typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
        const { marketStaticMath } = await market.getMarketInfo(params);
        return marketStaticMath;
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
        return getContractAddresses(this.chainId).PENDLE_SWAP;
    }

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): FixedRouterMetaMethodExtraParams<T> {
        const superParams = super.getDefaultMetaMethodExtraParams<T>();
        const method = superParams.method;

        const baseResult = {
            ...superParams,
            receiver: ContractMetaMethod.utils.getContractSignerAddress,
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

    createRouteContext<RouteType extends BaseRoute<RouteType>>({
        params,
        syEntity,
        slippage,
    }: {
        readonly params: FixedRouterMetaMethodExtraParams<'meta-method'>;
        readonly syEntity: SyEntity;
        readonly slippage: number;
    }): RouteContext<RouteType> {
        return new RouteContext({
            router: this,
            syEntity,
            routerExtraParams: params,
            aggregatorSlippage: slippage,
        });
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
        { netLpOut: BN; netSyUsed: BN; netPtUsed: BN; minLpOut: BN; afterMath: offchainMath.MarketStaticMath }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);

        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);

        const res = marketStaticMath.addLiquidityDualSyAndPtStatic(
            BN.from(syDesired).toBigInt(),
            BN.from(ptDesired).toBigInt()
        );
        const { netLpOut } = res;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function
        const metaMethod = await this.contract.metaCall.addLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            syDesired,
            ptDesired,
            minLpOut,
            {
                ...params,
                netLpOut: BN.from(res.netLpOut),
                netPtUsed: BN.from(res.netPtUsed),
                netSyUsed: BN.from(res.netSyUsed),
                afterMath: res.afterMath,
                minLpOut,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netPtUsed: BN;
            netSyUsed: BN;
            minLpOut: BN;
            intermediateSyAmount: BN;
            afterMath: offchainMath.MarketStaticMath;
            route: routeDef.AddLiquidityDualTokenAndPt;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.AddLiquidityDualTokenAndPt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const [syEntity, pt] = await Promise.all([marketEntity.syEntity(params.forCallStatic), marketEntity.pt()]);
        const tokenMintSyList = await syEntity.getTokensIn();

        // Components
        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);

        const buildContractMethodFromRoute = async (
            route: routeMod.Route.PartialRoute<'aggregatorResultGetter' | 'intermediateSyAmountGetter'>
        ) => {
            const [input, mintedSyAmount, marketStaticMath] = await Promise.all([
                tokenInputStructBuilder.call(route),
                Route.getIntermediateSyAmount(route),
                marketStaticMathPromise,
            ]);
            const addLiqResult = marketStaticMath.addLiquidityDualSyAndPtStatic(
                BN.from(mintedSyAmount).toBigInt(),
                BN.from(ptDesired).toBigInt()
            );
            const minLpOut = calcSlippedDownAmountSqrt(addLiqResult.netLpOut, slippage);
            const overrides = txOverridesValueFromTokenInput(input);
            const data = {
                ...mergeMetaMethodExtraParams({ overrides }, params),
                netLpOut: BN.from(addLiqResult.netLpOut),
                netPtUsed: BN.from(addLiqResult.netPtUsed),
                netSyUsed: BN.from(addLiqResult.netSyUsed),
                afterMath: addLiqResult.afterMath,

                minLpOut,
                intermediateSyAmount: mintedSyAmount,
            };
            return this.contract.metaCall.addLiquidityDualTokenAndPt(
                params.receiver,
                marketEntity.address,
                input,
                ptDesired,
                minLpOut,
                data
            );
        };
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'addLiquidityDualTokenAndPt',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter'],
                buildContractMethodFromRoute,
                async (metaMethod) => metaMethod.data.netLpOut
            );
        const inputTokenAmount = { token: tokenIn, amount: BN.from(tokenDesired) };
        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [
            inputTokenAmount,
            { token: pt, amount: BN.from(ptDesired) },
        ]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            {
                ...params,
                tokenInputStructBuilder,
            }
        );

        // Routing
        const partialRoutes = tokenMintSyList.map((tokenMintSy) =>
            routeMod.Route.assemble({
                approvedSignerAddressGetter,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    inputTokenAmount,
                    tokenMintSy,
                    slippage
                ),
                syIOTokenAmountGetter,
                contractMethodBuilder,
                gasUsedEstimator,
                intermediateSyAmountGetter,
                netOutGetter,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutes,
            inputTokenAmount
        );
        const routes = partialRoutes.map((route) => routeMod.Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('addLiquidityDualTokenAndPt', tokenIn, marketEntity.address, routes, {});
        }
        const { selectedRoute } = tokenMintSySelectionRoutingResult;

        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenMintSySelectionRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            netSyFromSwap: BN;
            approxParam: ApproxParamsStruct;
            minLpOut: BN;
            route: routeDef.AddLiquiditySinglePt;
            routes: routeDef.AddLiquiditySinglePt[];
            marketStaticMathBefore: offchainMath.MarketStaticMath;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.AddLiquiditySinglePt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };

        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const pureMarketAddLiqResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.addLiquiditySinglePtStatic(BN.from(netPtIn).toBigInt())
        );
        const limitOrderMatcherForRoute = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapPtForSy', [
            market,
            async () => BN.from((await pureMarketAddLiqResultPromise).netPtToSwap),
            { routerMethod: 'addLiquiditySinglePt' },
        ]);
        const buildContractMethodFromRoute = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            let netPtRemains = BN.from(netPtIn);
            let netSyHolding = BN.from(0);

            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);
            netPtRemains = bnMax(0, netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker));
            netSyHolding = netSyHolding.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.addLiquiditySinglePtStatic(netPtRemains.toBigInt(), {
                netSyHolding: netSyHolding.toBigInt(),
            });
            const netLpOut = BN.from(marketResult.netLpOut);
            const netPtToSwap = BN.from(marketResult.netPtToSwap);
            const approxParam = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'addLiquiditySinglePt',
                guessOffchain: netPtToSwap,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });
            const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function
            const data = {
                ...params,
                ...marketResult,
                netLpOut,
                netPtToSwap,
                netSyFromSwap: BN.from(marketResult.netSyFromSwap),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                approxParam,
                minLpOut,
                marketStaticMathBefore: marketStaticMath,
            };
            return this.contract.metaCall.addLiquiditySinglePt(
                params.receiver,
                marketEntity.address,
                netPtIn,
                minLpOut,
                approxParam,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                data
            );
        };

        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'addLiquiditySinglePt',
            ['limitOrderMatcher'],
            buildContractMethodFromRoute,
            async (metaMethod) => metaMethod.data.netLpOut
        );
        const routeWithLo = routeMod.Route.assemble({
            limitOrderMatcher: limitOrderMatcherForRoute,
            contractMethodBuilder,
            netOutGetter,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLo);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'addLiquiditySinglePt',
                await marketEntity.PT(),
                marketEntity.address,
                loRoutingResult.allRoutes
            );
        }
        const metaMethod = (await contractMethodBuilder.call(loRoutingResult.selectedRoute)).attachExtraData({
            route: loRoutingResult.selectedRoute,
            routes: loRoutingResult.allRoutes,
            loRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async addLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        _netSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleSy',
        {
            netLpOut: BN;
            netPtFromSwap: BN;
            netSyToSwap: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            approxParam: ApproxParamsStruct;
            minLpOut: BN;
            route: routeDef.AddLiquiditySingleSy;
            routes: routeDef.AddLiquiditySingleSy[];
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.AddLiquiditySingleSy>;
        }
    > {
        const netSyIn = BN.from(_netSyIn);
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);

        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const pureMarketAddLiqResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.addLiquiditySingleSyStatic(netSyIn.toBigInt())
        );

        const limitOrderMatcherForRoute = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapSyForPt', [
            market,
            async () => BN.from((await pureMarketAddLiqResultPromise).netSyToSwap),
            { routerMethod: 'addLiquiditySingleSy' },
        ]);

        const buildContractMethodFromRoute = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            let netSyRemains = BN.from(netSyIn);
            let netPtHolding = BN.from(0);

            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);

            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            netPtHolding = netPtHolding.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.addLiquiditySingleSyStatic(netSyRemains.toBigInt(), {
                netPtHolding: netPtHolding.toBigInt(),
            });
            const approxParam = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'addLiquiditySingleSy',
                guessOffchain: marketResult.netPtFromSwap,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });
            const minLpOut = calcSlippedDownAmountSqrt(marketResult.netLpOut, slippage); // note: different slip down amount function
            const data = {
                ...params,
                netLpOut: BN.from(marketResult.netLpOut),
                netPtFromSwap: BN.from(marketResult.netPtFromSwap),
                netSyToSwap: BN.from(marketResult.netSyToSwap),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                approxParam,
                minLpOut,
            };

            return this.contract.metaCall.addLiquiditySingleSy(
                params.receiver,
                marketEntity.address,
                netSyIn,
                minLpOut,
                approxParam,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                data
            );
        };

        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'addLiquiditySingleSy',
            ['limitOrderMatcher'],
            buildContractMethodFromRoute,
            async (metaMethod) => metaMethod.data.netLpOut
        );
        const withLoRoute = routeMod.Route.assemble({
            limitOrderMatcher: limitOrderMatcherForRoute,
            contractMethodBuilder,
            netOutGetter,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, withLoRoute);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'addLiquiditySingleSy',
                await marketEntity.SY(),
                marketEntity.address,
                loRoutingResult.allRoutes
            );
        }
        const metaMethod = (await contractMethodBuilder.call(loRoutingResult.selectedRoute)).attachExtraData({
            route: loRoutingResult.selectedRoute,
            routes: loRoutingResult.allRoutes,
            loRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);
        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const marketResult = marketStaticMath.addLiquiditySingleSyKeepYtStatic(BN.from(netSyIn).toBigInt());
        const { netLpOut, netYtOut } = marketResult;

        // note: different slip down amount function
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);
        const minYtOut = calcSlippedDownAmountSqrt(netYtOut, slippage);

        const metaMethod = await this.contract.metaCall.addLiquiditySingleSyKeepYt(
            params.receiver,
            marketAddr,
            netSyIn,
            minLpOut,
            minYtOut,
            {
                ...params,
                netLpOut: BN.from(marketResult.netLpOut),
                netYtOut: BN.from(marketResult.netYtOut),
                netSyToPY: BN.from(marketResult.netSyToPY),
                minLpOut,
                minYtOut,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            netSyMinted: BN;
            netSyToSwap: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minLpOut: BN;

            route: routeDef.AddLiquiditySingleToken;
            routes: routeDef.AddLiquiditySingleToken[];
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.AddLiquiditySingleToken>;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.AddLiquiditySingleToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const tokenMintSyList = await syEntity.getTokensIn();

        const routeLimitOrderMatcher = routeMod.helper.createMinimalRouteComponent(
            'LimitOrderMatcher.addLiquiditySingleToken',
            ['intermediateSyAmountGetter'],
            async (route) => {
                const [mintedSyAmount, marketStaticMath] = await Promise.all([
                    Route.getIntermediateSyAmount(route),
                    marketStaticMathPromise,
                ]);
                const simulatedAddLiquidityWithAllSy = marketStaticMath.addLiquiditySingleSyStatic(
                    mintedSyAmount.toBigInt()
                );
                return this.limitOrderMatcher.swapSyForPt(
                    marketEntity,
                    BN.from(simulatedAddLiquidityWithAllSy.netSyToSwap),
                    {
                        routerMethod: 'addLiquiditySingleToken',
                    }
                );
            }
        );

        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);
        const buildContractMethodFromRoute = async (
            route: routeMod.Route.PartialRoute<
                'aggregatorResultGetter' | 'intermediateSyAmountGetter' | 'limitOrderMatcher'
            >
        ) => {
            const [input, mintedSyAmount, limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                tokenInputStructBuilder.call(route),
                Route.getIntermediateSyAmount(route),
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);

            const netSyAfterLimit = mintedSyAmount.sub(limitOrderMatchedResult.netInputFromTaker);
            const netPtReceivedAfterLimit = BN.from(limitOrderMatchedResult.netOutputToTaker);
            const marketResult = marketStaticMath.addLiquiditySingleSyStatic(netSyAfterLimit.toBigInt(), {
                netPtHolding: netPtReceivedAfterLimit.toBigInt(),
            });
            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'addLiquiditySingleToken',
                guessOffchain: marketResult.netPtFromSwap,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });
            const netLpOut = BN.from(marketResult.netLpOut);
            const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: slipdown function is sqrt

            const overrides = txOverridesValueFromTokenInput(input);
            const data = {
                ...mergeMetaMethodExtraParams({ overrides }, params),

                netLpOut,
                netPtFromSwap: BN.from(marketResult.netPtFromSwap),
                netPtReceivedAfterLimit,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                netSyToSwap: BN.from(marketResult.netSyToSwap),
                netSyMinted: mintedSyAmount,
                intermediateSyAmount: mintedSyAmount,

                minLpOut,
            };
            return this.contract.metaCall.addLiquiditySingleToken(
                params.receiver,
                marketEntity.address,
                minLpOut,
                approxParams,
                input,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                data
            );
        };

        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'addLiquiditySingleToken',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter', 'limitOrderMatcher'],
                buildContractMethodFromRoute,
                async (metaMethod) => metaMethod.data.netLpOut
            );
        const mintedSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(this, syEntity, {
            ...params,
            tokenInputStructBuilder,
        });
        const rawTokenInput = { token: tokenIn, amount: BN.from(netTokenIn) };

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [rawTokenInput]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();

        const partialRoutesNoLO = tokenMintSyList.map((tokenMintSy) =>
            routeMod.Route.assemble({
                netOutGetter,
                contractMethodBuilder,
                limitOrderMatcher: routeMod.limitOrderMatcher.createEmpty(),
                intermediateSyAmountGetter: mintedSyAmountGetter,
                syIOTokenAmountGetter,
                gasUsedEstimator,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    rawTokenInput,
                    tokenMintSy,
                    slippage,
                    params
                ),
                approvedSignerAddressGetter,
            })
        );

        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutesNoLO,
            rawTokenInput
        );
        const routesNoLO = partialRoutesNoLO.map((route) =>
            routeMod.Route.assemble({ ...route, netOutInNativeEstimator })
        );
        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routesNoLO);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('addLiquiditySingleToken', tokenIn, marketEntity.address, routesNoLO);
        }

        const selectedRouteNoLO = tokenMintSySelectionRoutingResult.selectedRoute;
        const selectedRouteWithLO = routeMod.Route.assemble({
            ...selectedRouteNoLO,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, selectedRouteWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'addLiquiditySingleToken',
                tokenIn,
                marketEntity.address,
                loRoutingResult.allRoutes
            );
        }

        const metaMethod = (await contractMethodBuilder.call(loRoutingResult.selectedRoute)).attachExtraData({
            tokenMintSySelectionRoutingResult,
            loRoutingResult,
            route: loRoutingResult.selectedRoute,
            routes: [...routesNoLO, selectedRouteWithLO],
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    /**
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
        RouterMetaMethodReturnType<
            T,
            'addLiquiditySingleTokenKeepYt',
            {
                intermediateSyAmount: BN;
                netLpOut: BN;
                netYtOut: BN;
                netSyMinted: BN;
                netSyToPY: BN;
                minLpOut: BN;
                minYtOut: BN;
                afterMath: offchainMath.MarketStaticMath;
                route: routeDef.AddLiquiditySingleTokenKeepYt;
                routes: routeDef.AddLiquiditySingleTokenKeepYt[];
                tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.AddLiquiditySingleTokenKeepYt>;
            }
        >
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const tokenMintSyList = await syEntity.getTokensIn();

        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);
        const buildContractMethodFromRoute = async (
            route: routeMod.Route.PartialRoute<'intermediateSyAmountGetter' | 'aggregatorResultGetter'>
        ) => {
            const [input, mintedSyAmount, marketStaticMath] = await Promise.all([
                tokenInputStructBuilder.call(route),
                routeMod.Route.getIntermediateSyAmount(route),
                marketStaticMathPromise,
            ]);
            const marketResult = marketStaticMath.addLiquiditySingleSyKeepYtStatic(BN.from(mintedSyAmount).toBigInt());
            const minLpOut = calcSlippedDownAmountSqrt(marketResult.netLpOut, slippage);
            const minYtOut = calcSlippedDownAmountSqrt(marketResult.netYtOut, slippage);

            const overrides = txOverridesValueFromTokenInput(input);
            const data = {
                ...mergeMetaMethodExtraParams(params, { overrides }),
                netLpOut: BN.from(marketResult.netLpOut),
                netYtOut: BN.from(marketResult.netYtOut),
                netSyMinted: mintedSyAmount,
                netSyToPY: BN.from(marketResult.netSyToPY),
                afterMath: marketResult.afterMath,
                intermediateSyAmount: mintedSyAmount,
                minLpOut,
                minYtOut,
            };
            return this.contract.metaCall.addLiquiditySingleTokenKeepYt(
                params.receiver,
                marketEntity.address,
                minLpOut,
                minYtOut,
                input,
                data
            );
        };
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'addLiquiditySingleTokenKeepYt',
                ['intermediateSyAmountGetter', 'aggregatorResultGetter'],
                buildContractMethodFromRoute,
                async (metaMethod) => metaMethod.data.netLpOut
            );
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            {
                ...params,
                tokenInputStructBuilder,
            }
        );
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const rawTokenInput = { token: tokenIn, amount: BN.from(netTokenIn) };
        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [rawTokenInput]);

        const partialRoutes = tokenMintSyList.map((tokenMintSy) =>
            routeMod.Route.assemble({
                netOutGetter,
                contractMethodBuilder,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter,
                gasUsedEstimator,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    rawTokenInput,
                    tokenMintSy,
                    slippage,
                    params
                ),
                approvedSignerAddressGetter,
            })
        );

        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutes,
            rawTokenInput
        );
        const routes = partialRoutes.map((route) => routeMod.Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('addLiquiditySingleTokenKeepYt', tokenIn, marketEntity.address, routes);
        }
        const { selectedRoute } = tokenMintSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            routes,
            tokenMintSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            afterMath: offchainMath.MarketStaticMath;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);
        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const res = marketStaticMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt());
        const { netSyOut, netPtOut } = res;
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        const metaMethod = await this.contract.metaCall.removeLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            minSyOut,
            minPtOut,
            {
                ...params,
                netPtOut: BN.from(res.netPtOut),
                netSyOut: BN.from(res.netSyOut),
                afterMath: res.afterMath,
                minSyOut,
                minPtOut,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            afterMath: offchainMath.MarketStaticMath;
            intermediateSyAmount: BN;
            netTokenOut: BN;
            route: routeDef.RemoveLiquidityDualTokenAndPt;
            routes: routeDef.RemoveLiquidityDualTokenAndPt[];
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.RemoveLiquidityDualTokenAndPt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const marketResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt())
        );

        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const tokenRedeemSyList = await syEntity.getTokensOut();

        const buildContractMethod = async (tokenOutputStruct: routerTypes.TokenOutput, netTokenOut: BN) => {
            const marketResult = await marketResultPromise;
            const data = {
                netPtOut: BN.from(marketResult.netPtOut),
                afterMath: marketResult.afterMath,
                intermediateSyAmount: BN.from(marketResult.netSyOut),
            };

            return this.contract.metaCall.removeLiquidityDualTokenAndPt(
                params.receiver,
                marketEntity.address,
                lpToRemove,
                tokenOutputStruct,
                calcSlippedDownAmount(marketResult.netPtOut, slippage),
                { ...data, ...params, netTokenOut }
            );
        };

        const intermediateSyAmountGetter = routeMod.helper.createComponentFromConstant('syAmountToRedeem', async () =>
            BN.from((await marketResultPromise).netSyOut)
        );
        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [
            { token: marketEntity.address, amount: BN.from(lpToRemove) },
        ]);
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage, {
            aggregatorReceiver: params.aggregatorReceiver,
        });
        const tokenOutputStructBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, {
            slippage,
        });
        const { contractMethodBuilder, gasUsedEstimator, netOutGetter } =
            routeMod.helper.createComponentBundleForContractMethod(
                'removeLiquidityDualTokenAndPt',
                ['aggregatorResultGetter'],
                async (route) => {
                    const [aggregatorResult, tokenOutput] = await Promise.all([
                        routeMod.Route.getAggregatorResult(route),
                        tokenOutputStructBuilder.call(route),
                    ]);
                    return buildContractMethod(tokenOutput, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );

        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            routeMod.Route.assemble({
                approvedSignerAddressGetter,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    params,
                    ({ tokenOutput }) =>
                        buildContractMethod(tokenOutput, BN.from(0))
                            .then((metaMethod) => metaMethod.callStatic())
                            .then((res) => res.netTokenOut)
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                gasUsedEstimator,
                netOutGetter,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => routeMod.Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('removeLiquidityDualPtAndToken', marketEntity.address, tokenOut, routes);
        }
        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            routes,
            tokenRedeemSySelectionRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            netSyFromBurn: BN;
            netPtFromBurn: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minPtOut: BN;
            route: routeDef.RemoveLiquiditySinglePt;
            routes: routeDef.RemoveLiquiditySinglePt[];
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.RemoveLiquiditySinglePt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const removeLiqResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt())
        );

        const buildContractMethod = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            const [limitOrderMatchedResult, removeLiqResult] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                removeLiqResultPromise,
            ]);
            const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;
            let totalPtOut = BN.from(removeLiqResult.netPtOut);
            let netSyRemains = BN.from(removeLiqResult.netSyOut);

            totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);
            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);

            const swapSyForPtResult = afterLiqRemovalMarketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
            totalPtOut = totalPtOut.add(swapSyForPtResult.netPtOut);
            // netSyRemains should be zero by now
            const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);

            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'removeLiquiditySinglePt',
                approxSearchingRange: swapSyForPtResult.approxSearchingRange,
                guessOffchain: swapSyForPtResult.netPtOut,
                limitOrderMatchedResult,
                slippage,
            });
            return this.contract.metaCall.removeLiquiditySinglePt(
                params.receiver,
                marketEntity.address,
                lpToRemove,
                minPtOut,
                approxParams,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                {
                    ...params,
                    netPtOut: totalPtOut,
                    netPtFromSwap: BN.from(swapSyForPtResult.netPtOut),
                    netSyFeeFromMarket: BN.from(swapSyForPtResult.netSyFee),
                    netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                    netSyFromBurn: BN.from(removeLiqResult.netSyOut),
                    netPtFromBurn: BN.from(removeLiqResult.netPtOut),
                    priceImpact: swapSyForPtResult.priceImpact,
                    exchangeRateAfter: swapSyForPtResult.exchangeRateAfter,
                    minPtOut,
                }
            );
        };

        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'removeLiquiditySinglePt',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netPtOut
        );

        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapSyForPt', [
            marketEntity,
            async () => BN.from((await removeLiqResultPromise).netSyOut),
            { routerMethod: 'removeLiquiditySinglePt' },
        ]);
        const routeWithLO = routeMod.Route.assemble({
            contractMethodBuilder,
            netOutGetter,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'removeLiquiditySinglePt',
                marketEntity.address,
                await marketEntity.PT(),
                loRoutingResult.allRoutes
            );
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            routes: loRoutingResult.allRoutes,
            loRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFromSwap: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            netSyFromBurn: BN;
            netPtFromBurn: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minSyOut: BN;
            route: routeDef.RemoveLiquiditySinglePt;
            routes: routeDef.RemoveLiquiditySinglePt[];
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.RemoveLiquiditySingleSy>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);

        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const removeLiqResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt())
        );

        const buildContractMethod = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            const [limitOrderMatchedResult, removeLiqResult] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                removeLiqResultPromise,
            ]);
            const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;

            let totalSyOut = BN.from(removeLiqResult.netSyOut);
            let netPtRemains = BN.from(removeLiqResult.netPtOut);
            totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);
            netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);

            const swapPtToSyResult = afterLiqRemovalMarketStaticMath.swapExactPtForSyStaticAllowExpired(
                netPtRemains.toBigInt()
            );
            totalSyOut = totalSyOut.add(swapPtToSyResult.netSyOut);
            // netPtRemains should be zero by now
            const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);

            const data = {
                ...params,
                netSyOut: totalSyOut,
                netSyFromSwap: BN.from(swapPtToSyResult.netSyOut),
                netSyFeeFromMarket: BN.from(swapPtToSyResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                netSyFromBurn: BN.from(removeLiqResult.netSyOut),
                netPtFromBurn: BN.from(removeLiqResult.netPtOut),
                priceImpact: swapPtToSyResult.priceImpact,
                exchangeRateAfter: swapPtToSyResult.exchangeRateAfter,
                minSyOut,
            };

            return this.contract.metaCall.removeLiquiditySingleSy(
                params.receiver,
                marketEntity.address,
                lpToRemove,
                minSyOut,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                data
            );
        };

        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'removeLiquiditySingleSy',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netSyOut
        );

        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapPtForSy', [
            market,
            async () => BN.from((await removeLiqResultPromise).netPtOut),
            { routerMethod: 'removeLiquiditySingleSy' },
        ]);
        const routeWithLO = routeMod.Route.assemble({
            contractMethodBuilder,
            limitOrderMatcher: routeLimitOrderMatcher,
            netOutGetter,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'removeLiquiditySingleSy',
                marketEntity.address,
                await marketEntity.SY(),
                loRoutingResult.allRoutes
            );
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            routes: loRoutingResult.allRoutes,
            loRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFromBurn: BN;
            netPtFromBurn: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            netSyFromSwap: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
            intermediateSyAmount: BN;
            afterMath: offchainMath.MarketStaticMath;

            route: routeDef.RemoveLiquiditySingleToken;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<
                Route.PartialRoute<routeDef.ComponentsForLimitOrderRouting>
            >;
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.RemoveLiquiditySingleToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const removeLiqResultPromise = marketStaticMathPromise.then((marketMath) =>
            marketMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt())
        );

        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const tokenRedeemSyList = await syEntity.getTokensOut();

        const getDataFromRoute = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            const [limitOrderMatchedResult, removeLiqResult] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                removeLiqResultPromise,
            ]);
            const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;

            let netPtRemains = BN.from(removeLiqResult.netPtOut);
            let totalSyOut = BN.from(removeLiqResult.netSyOut);

            netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

            const swapPtToSyResult = afterLiqRemovalMarketStaticMath.swapExactPtForSyStaticAllowExpired(
                netPtRemains.toBigInt()
            );
            totalSyOut = totalSyOut.add(swapPtToSyResult.netSyOut);

            return {
                intermediateSyAmount: totalSyOut,
                netSyFromBurn: BN.from(removeLiqResult.netSyOut),
                netPtFromBurn: BN.from(removeLiqResult.netPtOut),
                netSyFeeFromMarket: BN.from(swapPtToSyResult.netSyFee),
                netSyFeeFromLimit: limitOrderMatchedResult.totalFee,
                netSyFromSwap: BN.from(swapPtToSyResult.netSyOut),
                priceImpact: swapPtToSyResult.priceImpact,
                exchangeRateAfter: swapPtToSyResult.exchangeRateAfter,

                limitOrderMatchedResult,
                afterMath: swapPtToSyResult.afterMath,
            };
        };

        const buildContractMethod = async (
            route: routeMod.Route.PartialRoute<'limitOrderMatcher'>,
            outputStruct: routerTypes.TokenOutput,
            netTokenOut: BN
        ) => {
            const [limitOrderMatchedResult, data] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                getDataFromRoute(route),
            ]);
            return this.contract.metaCall.removeLiquiditySingleToken(
                params.receiver,
                marketEntity.address,
                lpToRemove,
                outputStruct,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...data, ...params, netTokenOut }
            );
        };

        const intermediateSyAmountGetter = routeMod.helper.createMinimalRouteComponent(
            'IntermediateSyAmountGetter.removeLiquiditySingleSy',
            ['limitOrderMatcher'],
            (route) => getDataFromRoute(route).then(({ intermediateSyAmount }) => intermediateSyAmount)
        );
        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapPtForSy', [
            marketEntity,
            async () => BN.from((await removeLiqResultPromise).netPtOut),
            { routerMethod: 'removeLiquiditySingleToken' },
        ]);
        const loRoutingResult = await this.limitOrderRouteSelector(
            this,
            routeMod.Route.assemble({
                limitOrderMatcher: routeLimitOrderMatcher,
                netOutGetter: intermediateSyAmountGetter, // use intemediateSyAmount as netOutGetter here
            })
        );
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'removeLiquiditySingleToken',
                marketEntity.address,
                tokenOut,
                loRoutingResult.allRoutes
            );
        }
        const selectedLimitOrderMatcher = loRoutingResult.selectedRoute.limitOrderMatcher;

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [
            { token: marketEntity.address, amount: BN.from(lpToRemove) },
        ]);
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage, {
            aggregatorReceiver: params.aggregatorReceiver,
        });
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'removeLiquiditySinglePt',
                ['aggregatorResultGetter', 'limitOrderMatcher'],
                async (route) => {
                    const [tokenOutput, aggregatorResult] = await Promise.all([
                        tokenOutputBuilder.call(route),
                        routeMod.Route.getAggregatorResult(route),
                    ]);
                    return buildContractMethod(route, tokenOutput, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );

        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            routeMod.Route.assemble({
                approvedSignerAddressGetter,
                intermediateSyAmountGetter,
                limitOrderMatcher: selectedLimitOrderMatcher,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    { ...params, additionalDependencies: ['limitOrderMatcher'] },
                    ({ tokenOutput, route }) =>
                        buildContractMethod(route, tokenOutput, BN.from(0))
                            .then((metaMethod) => metaMethod.callStatic())
                            .then((res) => res.netTokenOut)
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));

        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('removeLiquiditySingleToken', marketEntity.address, tokenOut, routes);
        }
        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
            tokenRedeemSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minSyOut: BN;
            route: routeDef.SwapExactPtForSy;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactPtForSy>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const buildContractMethod = async (route: Route.PartialRoute<'limitOrderMatcher'>) => {
            let netPtRemains = BN.from(exactPtIn);
            let totalSyOut = BN.from(0);

            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);
            netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.swapExactPtForSyStatic(netPtRemains.toBigInt());
            totalSyOut = totalSyOut.add(marketResult.netSyOut);
            // netPtRemains should be zero by now

            const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);

            const data = {
                netSyOut: BN.from(totalSyOut),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minSyOut,
            };
            return this.contract.metaCall.swapExactPtForSy(
                params.receiver,
                marketEntity.address,
                exactPtIn,
                minSyOut,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...params, ...data }
            );
        };
        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapPtForSy', [
            marketEntity,
            BN.from(exactPtIn),
            { routerMethod: 'swapExactPtForSy' },
        ]);
        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'swapExactPtForSy',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netSyOut
        );
        const routeWithLO = Route.assemble({
            contractMethodBuilder,
            netOutGetter,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            const [pt, sy] = await Promise.all([
                marketEntity.pt(params.forCallStatic),
                marketEntity.sy(params.forCallStatic),
            ]);
            return this.throwNoRouteFoundError('swapExactPtForSy', pt, sy, loRoutingResult.allRoutes);
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyMinted: BN;
            netPtReceivedAfterLimit: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minPtOut: BN;
            intermediateSyAmount: BN;

            route: routeDef.SwapExactTokenForPt;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.SwapExactTokenForPt>;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactTokenForPt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const tokenMintSyList = await syEntity.getTokensIn();

        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);

        const buildContractMethod = async (
            route: Route.PartialRoute<'aggregatorResultGetter' | 'intermediateSyAmountGetter' | 'limitOrderMatcher'>
        ) => {
            const [input, mintedSyAmount, limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                tokenInputStructBuilder.call(route),
                Route.getIntermediateSyAmount(route),
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);

            let totalPtOut = BN.from(0);
            let netSyRemains = mintedSyAmount;

            totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);
            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);

            const marketResult = marketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
            totalPtOut = totalPtOut.add(marketResult.netPtOut);
            // netSyRemains should be zero by now

            const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);
            const data = {
                intermediateSyAmount: mintedSyAmount,
                netPtOut: totalPtOut,
                netSyMinted: mintedSyAmount,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(0),
                netPtReceivedAfterLimit: BN.from(0),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minPtOut,
                limitOrderMatchedResult,
            };
            const overrides = txOverridesValueFromTokenInput(input);
            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'swapExactTokenForPt',
                guessOffchain: marketResult.netPtOut,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });

            return this.contract.metaCall.swapExactTokenForPt(
                params.receiver,
                marketEntity.address,
                minPtOut,
                approxParams,
                input,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
            );
        };

        const rawTokenIn = { token: tokenIn, amount: BN.from(netTokenIn) };
        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [rawTokenIn]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            params
        );

        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'swapExactTokenForPt',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter', 'limitOrderMatcher'],
                buildContractMethod,
                async (metaMethod) => metaMethod.data.netPtOut
            );

        const partialRoutesNoLO = tokenMintSyList.map((tokenMintSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    rawTokenIn,
                    tokenMintSy,
                    slippage
                ),
                syIOTokenAmountGetter,
                intermediateSyAmountGetter,
                limitOrderMatcher: routeMod.limitOrderMatcher.createEmpty(),
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutesNoLO,
            rawTokenIn
        );
        const routesNoLO = partialRoutesNoLO.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));

        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routesNoLO);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('swapExactTokenForPt', tokenIn, await marketEntity.PT(), routesNoLO);
        }
        const selectedRouteNoLO = tokenMintSySelectionRoutingResult.selectedRoute;

        const routeLimitOrderMatcher = routeMod.helper.createMinimalRouteComponent(
            'LimitOrderMatcher.swapExcatTokenForPt',
            ['intermediateSyAmountGetter'],
            async (route) =>
                this.limitOrderMatcher.swapSyForPt(market, await Route.getIntermediateSyAmount(route), {
                    routerMethod: 'swapExactTokenForPt',
                })
        );
        const routeWithLO = Route.assemble({ ...selectedRouteNoLO, limitOrderMatcher: routeLimitOrderMatcher });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'swapExactTokenForPt',
                tokenIn,
                await marketEntity.PT(),
                loRoutingResult.allRoutes
            );
        }

        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenMintSySelectionRoutingResult,
            loRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minPtOut: BN;
            route: routeDef.SwapExactSyForPt;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactSyForPt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketAddr = marketEntity.address;
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);

        const buildContractMethod = async (route: Route.PartialRoute<'limitOrderMatcher'>) => {
            let netSyRemains = BN.from(exactSyIn);
            let totalPtOut = BN.from(0);

            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);
            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
            totalPtOut = totalPtOut.add(marketResult.netPtOut);
            // netSyRemains should be zero by now

            const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);
            const data = {
                netPtOut: totalPtOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minPtOut,
            };
            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'swapExactSyForPt',
                approxSearchingRange: marketResult.approxSearchingRange,
                guessOffchain: marketResult.netPtOut,
                slippage,
                limitOrderMatchedResult,
            });
            return this.contract.metaCall.swapExactSyForPt(
                params.receiver,
                marketAddr,
                exactSyIn,
                minPtOut,
                approxParams,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...data, ...params }
            );
        };

        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'swapExactSyForPt',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netPtOut
        );
        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapSyForPt', [
            market,
            BN.from(exactSyIn),
            { routerMethod: 'swapExactSyForPt' },
        ]);
        const routeWithLO = Route.assemble({
            contractMethodBuilder,
            netOutGetter,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'swapExactSyForPt',
                await marketEntity.SY(),
                await marketEntity.PT(),
                loRoutingResult.allRoutes
            );
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            minSyOut: BN;
            intermediateSyAmount: BN;
            route: routeDef.MintSyFromToken;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.MintSyFromToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const syEntity = typeof sy === 'string' ? new SyEntity(sy, this.entityConfig) : sy;
        const tokenMintSyList = await syEntity.getTokensIn();

        const rawTokenIn = { token: tokenIn, amount: BN.from(netTokenIn) };
        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [rawTokenIn]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            params
        );
        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);
        const buildContractMethod = async (
            route: Route.PartialRoute<'aggregatorResultGetter' | 'intermediateSyAmountGetter'>
        ) => {
            const [tokenInputStruct, netSyOut] = await Promise.all([
                tokenInputStructBuilder.call(route),
                Route.getIntermediateSyAmount(route),
            ]);
            const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
            const data = { netSyOut, minSyOut, intermediateSyAmount: netSyOut };
            const overrides = txOverridesValueFromTokenInput(tokenInputStruct);
            return this.contract.metaCall.mintSyFromToken(
                params.receiver,
                syEntity.address,
                minSyOut,
                tokenInputStruct,
                { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
            );
        };
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'mintSyFromToken',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter'],
                buildContractMethod,
                async (metaMethod) => metaMethod.data.netSyOut
            );

        const partialRoutes = tokenMintSyList.map((tokenMintSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    rawTokenIn,
                    tokenMintSy,
                    slippage
                ),
                syIOTokenAmountGetter,
                intermediateSyAmountGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutes,
            rawTokenIn
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));

        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('mintSyFromToken', tokenIn, syEntity.address, routes);
        }
        const { selectedRoute } = tokenMintSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenMintSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netTokenOut: BN;
            route: routeDef.RedeemSyToToken;
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.RedeemSyToToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const syEntity = typeof sy === 'string' ? new SyEntity(sy, this.entityConfig) : sy;
        const tokenRedeemSyList = await syEntity.getTokensOut();
        const syTokenAmount = { token: syEntity.address, amount: BN.from(netSyIn) };

        const buildContractMethod = async (tokenOutput: routerTypes.TokenOutput, netTokenOut?: BN) => {
            netTokenOut ??= BN.from(0);
            const data = {
                intermediateSyAmount: syTokenAmount.amount,
                netTokenOut,
            };
            return this.contract.metaCall.redeemSyToToken(
                params.receiver,
                syEntity.address,
                syTokenAmount.amount,
                tokenOutput,
                { ...params, ...data }
            );
        };

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [syTokenAmount]);
        const intermediateSyAmountGetter = routeMod.helper.createComponentFromConstant(
            'intermediateSyAmount.redeemSyToToken',
            syTokenAmount.amount
        );
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage, {
            aggregatorReceiver: params.aggregatorReceiver,
        });
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'reddemSyToToken',
                ['aggregatorResultGetter'],
                async (route) => {
                    const [aggregatorResult, tokenOutputStruct] = await Promise.all([
                        Route.getAggregatorResult(route),
                        tokenOutputBuilder.call(route),
                    ]);
                    return buildContractMethod(tokenOutputStruct, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );
        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    params,
                    async ({ tokenOutput }) =>
                        buildContractMethod(tokenOutput).then((metaMethod) => metaMethod.callStatic())
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                gasUsedEstimator,
                netOutGetter,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('redeemSyToToken', syEntity.address, tokenOut, routes);
        }
        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenRedeemSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            minPyOut: BN;
            intermediateSyAmount: BN;
            route: routeDef.MintPyFromToken;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.MintPyFromToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const tokenInputAmount = { token: tokenIn, amount: BN.from(netTokenIn) };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const pyIndexPromise = ytEntity.pyIndexCurrent(params.forCallStatic);
        const syEntity = await ytEntity.syEntity(params.forCallStatic);
        const tokenMintSyList = await syEntity.getTokensIn();

        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);

        const buildContractMethod = async (
            route: Route.PartialRoute<'aggregatorResultGetter' | 'intermediateSyAmountGetter'>
        ) => {
            const [input, mintedSyAmount, pyIndex] = await Promise.all([
                tokenInputStructBuilder.call(route),
                Route.getIntermediateSyAmount(route),
                pyIndexPromise,
            ]);
            const netPyOut = YtEntity.previewMintSyFromSyWithPyIndex(pyIndex, mintedSyAmount);
            const minPyOut = calcSlippedDownAmount(netPyOut, slippage);
            const data = { netPyOut, minPyOut, intermediateSyAmount: mintedSyAmount };

            const overrides = txOverridesValueFromTokenInput(input);
            return this.contract.metaCall.mintPyFromToken(params.receiver, ytEntity.address, minPyOut, input, {
                ...data,
                ...mergeMetaMethodExtraParams({ overrides }, params),
            });
        };

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [tokenInputAmount]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            params
        );
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'mintPYFromToken',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter'],
                buildContractMethod,
                async (metaMethod) => metaMethod.data.netPyOut
            );
        const partialRoutes = tokenMintSyList.map((tokenMintSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    tokenInputAmount,
                    tokenMintSy,
                    slippage
                ),
                syIOTokenAmountGetter,
                intermediateSyAmountGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutes,
            tokenInputAmount
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('mintPYFromToken', tokenIn, ytEntity.address, routes);
        }
        const { selectedRoute } = tokenMintSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenMintSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async mintPyFromSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountSyToMint: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'mintPyFromSy', { netPyOut: BN; minPyOut: BN }> {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const netPyOut = await ytEntity.previewMintPyFromSy(amountSyToMint);
        const minPyOut = calcSlippedDownAmount(netPyOut, slippage);
        const metaMethod = await this.contract.metaCall.mintPyFromSy(
            params.receiver,
            ytEntity.address,
            amountSyToMint,
            minPyOut,
            {
                ...params,
                netPyOut,
                minPyOut,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            pyIndex: offchainMath.PyIndex;
            intermediateSyAmount: BN;
            netTokenOut: BN;
            route: routeDef.RedeemPyToToken;
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.RedeemPyToToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const pyIndexPromise = ytEntity.pyIndexCurrent(params.forCallStatic);
        const [syEntity, ptEntity] = await Promise.all([
            ytEntity.syEntity(params.forCallStatic),
            ytEntity.ptEntity(params.forCallStatic),
        ]);
        const tokenRedeemSyList = await syEntity.getTokensOut(params.forCallStatic);

        const ytTokenAmount = { token: ytEntity.address, amount: BN.from(netPyIn) };
        const ptTokenAmount = { token: ptEntity.address, amount: BN.from(netPyIn) };
        const intermediateSyAmountPromise = (async () =>
            YtEntity.previewRedeemPyToSyWithPyIndex(await pyIndexPromise, netPyIn))();

        const buildContractMethod = async (tokenOutput: routerTypes.TokenOutput, netTokenOut: BN = BN.from(0)) => {
            const [pyIndex, intermediateSyAmount] = await Promise.all([pyIndexPromise, intermediateSyAmountPromise]);
            const data = {
                netTokenOut,
                intermediateSyAmount,
                pyIndex,
            };
            return this.contract.metaCall.redeemPyToToken(params.receiver, ytEntity.address, netPyIn, tokenOutput, {
                ...params,
                ...data,
            });
        };

        const intermediateSyAmountGetter = routeMod.helper.createComponentFromConstant(
            'intermediateSyAmountGetter.redeemPyToToken',
            intermediateSyAmountPromise
        );

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [
            ytTokenAmount,
            ptTokenAmount,
        ]);
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage);
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'redeemPyToToken',
                ['aggregatorResultGetter'],
                async (route) => {
                    const [aggregatorResult, tokenOutput] = await Promise.all([
                        Route.getAggregatorResult(route),
                        tokenOutputBuilder.call(route),
                    ]);
                    return buildContractMethod(tokenOutput, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );

        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    params,
                    async ({ tokenOutput }) =>
                        buildContractMethod(tokenOutput)
                            .then((metaMethod) => metaMethod.callStatic())
                            .then(({ netTokenOut }) => netTokenOut)
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('redeemPyToToken', ytEntity.address, tokenOut, routes);
        }

        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenRedeemSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async redeemPyToSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountPyToRedeem: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T>
    ): RouterMetaMethodReturnType<T, 'redeemPyToSy', { netSyOut: BN; minSyOut: BN }> {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const netSyOut = await ytEntity.previewRedeemPyToSy(amountPyToRedeem);
        const minSyOut = calcSlippedDownAmount(netSyOut, slippage);
        const metaMethod = await this.contract.metaCall.redeemPyToSy(
            params.receiver,
            ytEntity.address,
            amountPyToRedeem,
            minSyOut,
            {
                ...params,
                netSyOut,
                minSyOut,
            }
        );

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            approxParams: ApproxParamsStruct;
            minYtOut: BN;

            route: routeDef.SwapExactSyForYt;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactSyForYt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const buildContractMethod = async (route: Route.PartialRoute<'limitOrderMatcher'>) => {
            let netSyRemains = BN.from(exactSyIn);
            let totalYtOut = BN.from(0);

            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);
            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalYtOut = totalYtOut.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.swapExactSyForYtStatic(netSyRemains.toBigInt());
            totalYtOut = totalYtOut.add(marketResult.netYtOut);
            // netSyRemains should be zero by now

            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'swapExactSyForYt',
                guessOffchain: marketResult.netYtOut,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });
            const minYtOut = calcSlippedDownAmount(totalYtOut, slippage);
            const data = {
                netYtOut: BN.from(totalYtOut),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                approxParams,
                minYtOut,
            };
            return this.contract.metaCall.swapExactSyForYt(
                params.receiver,
                marketEntity.address,
                exactSyIn,
                minYtOut,
                approxParams,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...params, ...data }
            );
        };
        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapSyForYt', [
            marketEntity,
            BN.from(exactSyIn),
            { routerMethod: 'swapExactSyForYt' },
        ]);
        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'swapExactSyForYt',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netYtOut
        );

        const routeWithLO = Route.assemble({
            contractMethodBuilder,
            netOutGetter,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            const [sy, yt] = await Promise.all([
                marketEntity.sy(params.forCallStatic),
                marketEntity.yt(params.forCallStatic),
            ]);
            return this.throwNoRouteFoundError('swapExactSyForYt', sy, yt, loRoutingResult.allRoutes);
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netTokenOut: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            netSyReceivedAfterLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;

            route: routeDef.SwapExactPtForToken;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<
                Route.PartialRoute<routeDef.ComponentsForLimitOrderRouting>
            >;
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.SwapExactPtForToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const [syEntity, ptEntity] = await Promise.all([
            marketEntity.syEntity(params.forCallStatic),
            marketEntity.ptEntity(params.forCallStatic),
        ]);
        const ptTokenAmount = { token: ptEntity.address, amount: BN.from(exactPtIn) };
        const tokenRedeemSyList = await syEntity.getTokensOut();

        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapPtForSy', [
            marketEntity,
            ptTokenAmount.amount,
            { routerMethod: 'swapExactPtForToken' },
        ]);

        const getDataFromRoute = async (route: routeMod.Route.PartialRoute<'limitOrderMatcher'>) => {
            const marketStaticMath = await marketStaticMathPromise;
            const limitOrderMatchedResult = await Route.getMatchedLimitOrderResult(route);
            const netPtAfterLimit = ptTokenAmount.amount.sub(limitOrderMatchedResult.netInputFromTaker);
            const netSyReceivedAfterLimit = BN.from(limitOrderMatchedResult.netOutputToTaker);
            const marketResult = marketStaticMath.swapExactPtForSyStatic(netPtAfterLimit.toBigInt());
            const netSyOut = netSyReceivedAfterLimit.add(marketResult.netSyOut);

            return {
                intermediateSyAmount: netSyOut,
                netSyReceivedAfterLimit,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                limitOrderMatchedResult,
            };
        };

        const intermediateSyAmountGetter = routeMod.helper.createMinimalRouteComponent(
            'intermediateSyAmountGetter.swapExactPtForToken',
            ['limitOrderMatcher'],
            async (route) => getDataFromRoute(route).then(({ intermediateSyAmount }) => intermediateSyAmount)
        );

        const partialRouteWithLO = Route.assemble({
            limitOrderMatcher: routeLimitOrderMatcher,
            netOutGetter: intermediateSyAmountGetter, // Intermediate process net out getter to be SY.
        });

        const loRoutingResult = await this.limitOrderRouteSelector(this, partialRouteWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'swapExactPtForToken',
                ptTokenAmount.token,
                tokenOut,
                loRoutingResult.allRoutes
            );
        }

        const buildContractMethod = async (
            route: routeMod.Route.PartialRoute<'limitOrderMatcher'>,
            tokenOutput: routerTypes.TokenOutput,
            netTokenOut: BN = BN.from(0)
        ) => {
            const [limitOrderMatchedResult, data] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                getDataFromRoute(route),
            ]);
            return this.contract.metaCall.swapExactPtForToken(
                params.receiver,
                marketEntity.address,
                exactPtIn,
                tokenOutput,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...data, ...params, netTokenOut }
            );
        };

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [ptTokenAmount]);
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage, {
            aggregatorReceiver: params.aggregatorReceiver,
        });
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'swapExactPtForToken',
                ['limitOrderMatcher', 'aggregatorResultGetter'],
                async (route) => {
                    const [aggregatorResult, tokenOutput] = await Promise.all([
                        Route.getAggregatorResult(route),
                        tokenOutputBuilder.call(route),
                    ]);
                    return buildContractMethod(route, tokenOutput, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );

        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                limitOrderMatcher: loRoutingResult.selectedRoute.limitOrderMatcher,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    { ...params, additionalDependencies: ['limitOrderMatcher'] },
                    async ({ route, tokenOutput }) =>
                        buildContractMethod(route, tokenOutput)
                            .then((metaMethod) => metaMethod.callStatic())
                            .then((data) => data.netTokenOut)
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);

        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('swapExactPtForToken', ptTokenAmount.token, tokenOut, routes);
        }

        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;

        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
            tokenRedeemSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minSyOut: BN;
            route: routeDef.SwapExactYtForSy;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactYtForSy>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(market, params);
        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapYtForSy', [
            market,
            BN.from(exactYtIn),
            { routerMethod: 'swapExactYtForSy' },
        ]);
        const buildContractMethod = async (route: Route.PartialRoute<'limitOrderMatcher'>) => {
            let totalSyOut = BN.from(0);
            let netYtRemains = BN.from(exactYtIn);

            const [marketStaticMath, limitOrderMatchedResult] = await Promise.all([
                marketStaticMathPromise,
                Route.getMatchedLimitOrderResult(route),
            ]);
            totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);
            netYtRemains = netYtRemains.sub(limitOrderMatchedResult.netInputFromTaker);

            const marketResult = marketStaticMath.swapExactYtForSyStatic(netYtRemains.toBigInt());
            totalSyOut = totalSyOut.add(marketResult.netSyOut);
            // netYtRemains should be zero by now.

            const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);
            const data = {
                netSyOut: BN.from(totalSyOut),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minSyOut,
            };
            return this.contract.metaCall.swapExactYtForSy(
                params.receiver,
                marketEntity.address,
                exactYtIn,
                minSyOut,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...params, ...data }
            );
        };
        const { contractMethodBuilder, netOutGetter } = routeMod.helper.createComponentBundleForContractMethod(
            'swapExactYtForSy',
            ['limitOrderMatcher'],
            buildContractMethod,
            async (metaMethod) => metaMethod.data.netSyOut
        );
        const routeWithLO = Route.assemble({
            limitOrderMatcher: routeLimitOrderMatcher,
            contractMethodBuilder,
            netOutGetter,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            const [yt, sy] = await Promise.all([
                marketEntity.yt(params.forCallStatic),
                marketEntity.sy(params.forCallStatic),
            ]);
            return this.throwNoRouteFoundError('swapExactYtForSy', yt, sy, loRoutingResult.allRoutes);
        }
        const { selectedRoute } = loRoutingResult;
        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyMinted: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            minYtOut: BN;
            route: routeDef.SwapExactTokenForYt;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.SwapExactTokenForYt>;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<routeDef.SwapExactTokenForYt>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const inputTokenAmount = { token: tokenIn, amount: BN.from(netTokenIn) };
        const tokenMintSyList = await syEntity.getTokensIn();
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);

        const tokenInputBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);

        const buildContractMethod = async (
            route: Route.PartialRoute<'aggregatorResultGetter' | 'intermediateSyAmountGetter' | 'limitOrderMatcher'>
        ) => {
            const [input, mintedSyAmount, marketStaticMath, limitOrderMatchedResult] = await Promise.all([
                tokenInputBuilder.call(route),
                Route.getIntermediateSyAmount(route),
                marketStaticMathPromise,
                Route.getMatchedLimitOrderResult(route),
            ]);

            let netSyRemains = mintedSyAmount;
            let totalYtOut = BN.from(0);

            netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalYtOut = totalYtOut.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.swapExactSyForYtStatic(netSyRemains.toBigInt());
            totalYtOut = totalYtOut.add(marketResult.netYtOut);

            const approxParams = await this.approxParamsGenerator.generate(this, {
                routerMethod: 'swapExactTokenForYt',
                guessOffchain: marketResult.netYtOut,
                slippage,
                approxSearchingRange: marketResult.approxSearchingRange,
                limitOrderMatchedResult,
            });
            const minYtOut = calcSlippedDownAmount(totalYtOut, slippage);
            const overrides = txOverridesValueFromTokenInput(input);

            const data = {
                intermediateSyAmount: mintedSyAmount,
                netYtOut: totalYtOut,
                netSyMinted: mintedSyAmount,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minYtOut,
            };

            return this.contract.metaCall.swapExactTokenForYt(
                params.receiver,
                marketEntity.address,
                minYtOut,
                approxParams,
                input,
                limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...mergeMetaMethodExtraParams({ overrides }, params), ...data }
            );
        };

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [inputTokenAmount]);
        const syIOTokenAmountGetter = routeMod.syIOTokenAmountGetter.createTokenMintSyGetter();
        const intermediateSyAmountGetter = routeMod.intermediateSyAmountGetter.createMintedSyAmountGetter(
            this,
            syEntity,
            params
        );
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'swapExactTokenForYt',
                ['aggregatorResultGetter', 'intermediateSyAmountGetter', 'limitOrderMatcher'],
                buildContractMethod,
                async (metaMethod) => metaMethod.data.netYtOut
            );
        const partialRoutesNoLO = tokenMintSyList.map((tokenMintSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                aggregatorResultGetter: routeMod.aggregatorResultGetter.createFromRawToken(
                    this,
                    inputTokenAmount,
                    tokenMintSy,
                    slippage
                ),
                syIOTokenAmountGetter,
                intermediateSyAmountGetter,
                limitOrderMatcher: routeMod.limitOrderMatcher.createEmpty(), // empty first to find the token mint sy
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );
        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createRelativeToToken(
            this,
            partialRoutesNoLO,
            inputTokenAmount
        );
        const routesNoLO = partialRoutesNoLO.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenMintSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routesNoLO);
        if (tokenMintSySelectionRoutingResult.verdict === 'FAILED') {
            const yt = await marketEntity.yt(params.forCallStatic);
            return this.throwNoRouteFoundError('swapExactTokenForYt', tokenIn, yt, routesNoLO);
        }
        const { selectedRoute: selectedRouteNoLO } = tokenMintSySelectionRoutingResult;

        const routeLimitOrderMatcher = routeMod.helper.createMinimalRouteComponent(
            'swapExactTokenForYt',
            ['intermediateSyAmountGetter'],
            async (route) => {
                const mintedSyAmount = await Route.getIntermediateSyAmount(route);
                return this.limitOrderMatcher.swapSyForYt(market, mintedSyAmount, {
                    routerMethod: 'swapExactTokenForYt',
                });
            }
        );
        const routeWithLO = Route.assemble({
            ...selectedRouteNoLO,
            limitOrderMatcher: routeLimitOrderMatcher,
        });
        const loRoutingResult = await this.limitOrderRouteSelector(this, routeWithLO);
        if (loRoutingResult.verdict === 'FAILED') {
            const yt = await marketEntity.yt(params.forCallStatic);
            return this.throwNoRouteFoundError('swapExactTokenForYt', tokenIn, yt, loRoutingResult.allRoutes);
        }
        const { selectedRoute } = loRoutingResult;

        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            tokenMintSySelectionRoutingResult,
            loRoutingResult,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            netSyOut: BN;
            netTokenOut: BN;
            limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
            route: routeDef.SwapExactYtForToken;
            loRoutingResult: routerComponents.LimitOrderRouteSelectorResult<
                Route.PartialRoute<routeDef.ComponentsForLimitOrderRouting>
            >;
            tokenRedeemSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.SwapExactYtForToken>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketStaticMathPromise = this.getMarketStaticMathWithParams(marketEntity, params);
        const [syEntity, ytEntity] = await Promise.all([
            marketEntity.syEntity(params.forCallStatic),
            marketEntity.ytEntity(params.forCallStatic),
        ]);
        const tokenRedeemSyList = await syEntity.getTokensOut();
        const ytTokenAmount = { token: ytEntity.address, amount: BN.from(exactYtIn) };

        const getDataFromRoute = async (route: Route.PartialRoute<'limitOrderMatcher'>) => {
            const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
                Route.getMatchedLimitOrderResult(route),
                marketStaticMathPromise,
            ]);
            let netYtRemains = BN.from(exactYtIn);
            let totalSyOut = BN.from(0);

            netYtRemains = netYtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
            totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

            const marketResult = marketStaticMath.swapExactYtForSyStatic(netYtRemains.toBigInt());
            totalSyOut = totalSyOut.add(marketResult.netSyOut);

            const data = {
                intermediateSyAmount: totalSyOut,
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                netSyOut: totalSyOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                limitOrderMatchedResult,
            };
            return data;
        };

        const buildContractMethod = async (
            route: Route.PartialRoute<'limitOrderMatcher'>,
            tokenOutput: routerTypes.TokenOutput,
            netTokenOut: BN = BN.from(0)
        ) => {
            const data = await getDataFromRoute(route);
            return this.contract.metaCall.swapExactYtForToken(
                params.receiver,
                marketEntity.address,
                exactYtIn,
                tokenOutput,
                data.limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
                { ...data, ...params, netTokenOut }
            );
        };

        const routeLimitOrderMatcher = routeMod.limitOrderMatcher.createWithRouterComponent(this, 'swapYtForSy', [
            marketEntity,
            BN.from(exactYtIn),
            { routerMethod: 'swapExactYtForToken' },
        ]);
        const intermediateSyAmountGetter = routeMod.helper.createMinimalRouteComponent(
            'swapExactYtForToken',
            ['limitOrderMatcher'],
            async (route) => getDataFromRoute(route).then(({ netSyOut }) => netSyOut)
        );
        const loRoutingResult = await this.limitOrderRouteSelector(
            this,
            Route.assemble({
                limitOrderMatcher: routeLimitOrderMatcher,
                netOutGetter: intermediateSyAmountGetter, // use sy amount as intermediate net out getter
            })
        );
        if (loRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError(
                'swapExactYtForToken',
                ytEntity.address,
                tokenOut,
                loRoutingResult.allRoutes
            );
        }

        const approvedSignerAddressGetter = routeMod.createApprovedSignerAddressGetter(this, [ytTokenAmount]);
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        const aggregatorResultGetter = routeMod.aggregatorResultGetter.createToRawToken(this, tokenOut, slippage, {
            aggregatorReceiver: params.aggregatorReceiver,
        });
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'swapExactYtForToken',
                ['limitOrderMatcher', 'aggregatorResultGetter'],
                async (route) => {
                    const [aggregatorResult, tokenOutput] = await Promise.all([
                        Route.getAggregatorResult(route),
                        tokenOutputBuilder.call(route),
                    ]);
                    return buildContractMethod(route, tokenOutput, aggregatorResult.outputAmount);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );
        const partialRoutes = tokenRedeemSyList.map((tokenRedeemSy) =>
            Route.assemble({
                approvedSignerAddressGetter,
                limitOrderMatcher: loRoutingResult.selectedRoute.limitOrderMatcher,
                intermediateSyAmountGetter,
                syIOTokenAmountGetter: routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
                    tokenRedeemSy,
                    syEntity,
                    { ...params, additionalDependencies: ['limitOrderMatcher'] },
                    async ({ route, tokenOutput }) =>
                        buildContractMethod(route, tokenOutput)
                            .then((metaMethod) => metaMethod.callStatic())
                            .then(({ netTokenOut }) => netTokenOut)
                ),
                aggregatorResultGetter,
                contractMethodBuilder,
                netOutGetter,
                gasUsedEstimator,
            })
        );

        const netOutInNativeEstimator = await routeMod.netOutInNativeEstimator.createFromAllRawTokenOut(
            this,
            tokenOut,
            partialRoutes
        );
        const routes = partialRoutes.map((route) => Route.assemble({ ...route, netOutInNativeEstimator }));
        const tokenRedeemSySelectionRoutingResult = await this.optimalOutputRouteSelector(this, routes);
        if (tokenRedeemSySelectionRoutingResult.verdict === 'FAILED') {
            return this.throwNoRouteFoundError('swapExactYtForToken', ytEntity.address, tokenOut, routes);
        }

        const { selectedRoute } = tokenRedeemSySelectionRoutingResult;

        const metaMethod = (await contractMethodBuilder.call(selectedRoute)).attachExtraData({
            route: selectedRoute,
            loRoutingResult,
            tokenRedeemSySelectionRoutingResult,
        });
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            approxParam: ApproxParamsStruct;
            minPtOut: BN;
            afterMath: offchainMath.MarketStaticMath;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);
        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const res = marketStaticMath.swapExactYtForPtStatic(BN.from(exactYtIn).toBigInt());
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = await this.approxParamsGenerator.generate(this, {
            routerMethod: 'swapExactYtForPt',
            guessOffchain: totalPtSwapped,
            slippage,
            approxSearchingRange: res.approxSearchingRange,
            limitOrderMatchedResult: undefined,
        });
        const minPtOut = calcSlippedDownAmount(netPtOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactYtForPt(
            params.receiver,
            marketAddr,
            exactYtIn,
            minPtOut,
            approxParam,
            {
                netPtOut: BN.from(netPtOut),
                totalPtSwapped: BN.from(res.totalPtSwapped),
                netSyFee: BN.from(res.netSyFee),
                priceImpact: res.priceImpact,
                exchangeRateAfter: res.exchangeRateAfter,
                afterMath: res.afterMath,
                approxParam,
                minPtOut,
                ...params,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            approxParam: ApproxParamsStruct;
            minYtOut: BN;
            afterMath: offchainMath.MarketStaticMath;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);
        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const res = marketStaticMath.swapExactPtForYtStatic(BN.from(exactPtIn).toBigInt());
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = await this.approxParamsGenerator.generate(this, {
            routerMethod: 'swapExactPtForYt',
            guessOffchain: totalPtToSwap,
            slippage,
            approxSearchingRange: res.approxSearchingRange,
            limitOrderMatchedResult: undefined,
        });
        const minYtOut = calcSlippedDownAmount(netYtOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactPtForYt(
            params.receiver,
            marketAddr,
            exactPtIn,
            minYtOut,
            approxParam,
            {
                netYtOut: BN.from(netYtOut),
                totalPtToSwap: BN.from(totalPtToSwap),
                netSyFee: BN.from(res.netSyFee),
                priceImpact: res.priceImpact,
                exchangeRateAfter: res.exchangeRateAfter,
                approxParam,
                minYtOut,
                afterMath: res.afterMath,
                ...params,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async redeemDueInterestAndRewards<T extends MetaMethodType>(
        redeemingSources: {
            sys?: (Address | SyEntity)[];
            yts?: (Address | YtEntity)[];
            markets?: (Address | MarketEntity)[];
        },
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'redeemDueInterestAndRewards'> {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const sys = redeemingSources.sys?.map(BaseRouter.extractAddress) ?? [];
        const yts = redeemingSources.yts?.map(BaseRouter.extractAddress) ?? [];
        const markets = redeemingSources.markets?.map(BaseRouter.extractAddress) ?? [];
        const metaMethod = await this.contract.metaCall.redeemDueInterestAndRewards(
            params.receiver,
            sys,
            yts,
            markets,
            params
        );

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        srcMarket = typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        dstMarket = typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSy, dstSy] = await Promise.all([srcMarket.sy(), dstMarket.sy()]);
        if (!areSameAddresses(srcSy, dstSy)) {
            throw new PendleSdkError('Source and destination market should share the same SY');
        }
        const removeLiquidityMetaMethod = await this.removeLiquiditySingleSy(
            srcMarket,
            netLpToMigrate,
            slippage,
            params
        );
        const netSyToZapIn = removeLiquidityMetaMethod.data.netSyOut;
        const addLiquidityMetaMethod = await this.addLiquiditySingleSy(dstMarket, netSyToZapIn, slippage, params);
        const netLpOut = addLiquidityMetaMethod.data.netLpOut;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);

        const routerHelper = this.getRouterHelper();
        const metaMethod = await routerHelper.metaCall.transferLiquiditySameSyNormal(
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
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        srcMarket = typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        dstMarket = typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSy, dstSy] = await Promise.all([srcMarket.sy(), dstMarket.sy()]);
        if (!areSameAddresses(srcSy, dstSy)) {
            throw new PendleSdkError('Source and destination market should share the same SY');
        }
        const removeLiquidityMetaMethod = await this.removeLiquiditySingleSy(
            srcMarket,
            netLpToMigrate,
            slippage,
            params
        );
        const netSyToZapIn = removeLiquidityMetaMethod.data.netSyOut;
        const addLiquidityMetaMethod = await this.addLiquiditySingleSyKeepYt(dstMarket, netSyToZapIn, slippage, params);
        const netLpOut = addLiquidityMetaMethod.data.netLpOut;
        const netYtOut = addLiquidityMetaMethod.data.netYtOut;
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage);
        const minYtOut = calcSlippedDownAmountSqrt(netYtOut, slippage);

        const routerHelper = this.getRouterHelper();
        const metaMethod = await routerHelper.metaCall.transferLiquiditySameSyKeepYt(
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

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute;
            addLiquidityRoute: liqMigrationRoutes.AddLiquiditySingleTokenForMigrationRoute;
            route: liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyRoute;
        }
    > {
        const redeemRewards = _params.redeemRewards ?? false;
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const srcMarketEntity =
            typeof srcMarket === 'string' ? new MarketEntity(srcMarket, this.entityConfig) : srcMarket;
        const dstMarketEntity =
            typeof dstMarket === 'string' ? new MarketEntity(dstMarket, this.entityConfig) : dstMarket;
        const [srcSyEntity, dstSyEntity] = await Promise.all([
            srcMarketEntity.syEntity({ entityConfig: this.entityConfig }),
            dstMarketEntity.syEntity({ entityConfig: this.entityConfig }),
        ]);

        const removeLiqContext =
            this.createRouteContext<liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper>({
                params,
                syEntity: srcSyEntity,
                slippage,
            });
        const addLiqContext = this.createRouteContext<AddLiquiditySingleTokenRoute>({
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

        const liquidityMigrationContext =
            this.createRouteContext<liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyRoute>({
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
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, [], {
                cause,
            })
        );
        const metaMethod = await route.buildCall();
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute;
            addLiquidityRoute: liqMigrationRoutes.AddLiquiditySingleTokenKeepYtForMigrationRoute;
            route: liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyKeepYtRoute;
        }
    > {
        const redeemRewards = _params.redeemRewards ?? false;
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
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

        const removeLiqContext =
            this.createRouteContext<liqMigrationRoutes.PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper>({
                params,
                syEntity: srcSyEntity,
                slippage,
            });
        const addLiqContext = this.createRouteContext<AddLiquiditySingleTokenKeepYtRoute>({
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

        const liquidityMigrationContext =
            this.createRouteContext<liqMigrationRoutes.LiquidityMigrationFixTokenRedeemSyKeepYtRoute>({
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
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, [], {
                cause,
            })
        );
        const metaMethod = await route.buildCall();
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async swapTokenToToken<T extends MetaMethodType>(
        input: RawTokenAmount,
        outputToken: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapTokenToToken',
        {
            netTokenOut: BN;
            minTokenOut: BN;
            tokenInputStruct: TokenInput;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const res = await this.aggregatorHelper.makeCall(input, outputToken, slippage);
        const swapData = res.createSwapData({ needScale: false });
        const pendleSwap = this.getPendleSwapAddress(swapData.swapType);
        const tokenInputStruct: TokenInput = {
            tokenIn: input.token,
            netTokenIn: input.amount,
            tokenMintSy: outputToken,
            pendleSwap,
            swapData,
        };
        const netTokenOut = res.outputAmount;
        const minTokenOut = calcSlippedDownAmount(netTokenOut, slippage);
        const valueOverrides = txOverridesValueFromTokenInput(tokenInputStruct);
        const metaMethod = await this.contract.metaCall.swapTokenToToken(
            params.receiver,
            minTokenOut,
            tokenInputStruct,
            {
                ...mergeMetaMethodExtraParams(params, { overrides: valueOverrides }),
                netTokenOut,
                minTokenOut,
                tokenInputStruct,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
    }

    async swapTokenToTokenViaSy<T extends MetaMethodType>(
        sy: Address | SyEntity,
        input: RawTokenAmount<BigNumberish>,
        outputToken: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapTokenToTokenViaSy',
        {
            netTokenOut: BN;
            minTokenOut: BN;
            intermediateSyAmount: BN;

            route: routeDef.SwapTokenToTokenViaSy;
            tokenMintSySelectionRoutingResult: routerComponents.OptimalOutputRouteSelectionResult<routeDef.SwapTokenToTokenViaSy>;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const syEntity = typeof sy === 'string' ? new SyEntity(sy, this.entityConfig) : sy;

        // TODO check if outputToken is one of sy's tokens out early.
        // Currently the tokenRedeemSyGetter will throw error on non SY's token out.

        // TODO do better way.
        const mintSyResult = await this.mintSyFromToken(syEntity, input.token, input.amount, slippage, params);
        const originalRoute = mintSyResult.data.route;

        const tokenInputStructBuilder = routeMod.routeComponentHelper.createTokenInputStructBuilder(this);
        const buildContractMethod = async (netTokenOut: BN) => {
            const tokenInput = await tokenInputStructBuilder.call(originalRoute);
            const minTokenOut = calcSlippedDownAmount(netTokenOut, slippage);
            const overrides = txOverridesValueFromTokenInput(tokenInput);
            return this.contract.metaCall.swapTokenToTokenViaSy(
                params.receiver,
                syEntity.address,
                tokenInput,
                outputToken,
                minTokenOut,
                {
                    ...params,
                    overrides,
                    netTokenOut,
                    minTokenOut,
                }
            );
        };
        const tokenRedeemSyGetter = routeMod.syIOTokenAmountGetter.createTokenRedeemSyGetter(
            outputToken,
            syEntity,
            params,
            async () => {
                return buildContractMethod(BN.from(0))
                    .then((metaMethod) => metaMethod.callStatic())
                    .then((res) => res.netTokenOut);
            }
        );
        const { contractMethodBuilder, netOutGetter, gasUsedEstimator } =
            routeMod.helper.createComponentBundleForContractMethod(
                'swapTokenToTokenViaSy',
                ['approvedSignerAddressGetter', 'intermediateSyAmountGetter'],
                async (route) => {
                    const { amount: tokenOut } = await tokenRedeemSyGetter.call(route);
                    return buildContractMethod(tokenOut);
                },
                async (metaMethod) => metaMethod.data.netTokenOut
            );

        const modifiedRoute = Route.assemble({
            ...originalRoute,
            contractMethodBuilder,
            netOutGetter,
            gasUsedEstimator,
        });
        const metaMethod = (await contractMethodBuilder.call(modifiedRoute)).attachExtraData({
            route: modifiedRoute,
            tokenMintSySelectionRoutingResult: mintSyResult.data.tokenMintSySelectionRoutingResult,
            intermediateSyAmount: mintSyResult.data.intermediateSyAmount,
        });

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
        const tokenOutputBuilder = routeMod.routeComponentHelper.createTokenOutputStructBuilder(this, { slippage });
        return Promise.all(
            syTokenAmounts.map(async ({ token, amount }) => {
                const res = await this.redeemSyToToken(token, amount, tokenOut, slippage, {
                    aggregatorReceiver: params.receiver,
                    method: 'meta-method',
                });
                return tokenOutputBuilder.call(res.data.route);
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
                    return this.throwNoRouteFoundError('sell token', tokenAmount.token, tokenOut, [], { cause });
                }
            })
        );
        return swapData;
    }

    protected async throwNoRouteFoundError<RC extends routeMod.Route.ComponentName>(
        actionName: string,
        from: Address,
        to: Address,
        routes: routeMod.Route.PartialRoute<RC>[],
        errorOptions?: PendleSdkErrorParams
    ): Promise<never> {
        this.events.emit('noRouteFound', { actionName, from, to, errorOptions, routes });
        throw new NoRouteFoundError(actionName, from, to, errorOptions);
    }

    getMarketAddress(market: Address | MarketEntity): Address {
        return typeof market === 'string' ? market : market.address;
    }

    getMarketEntity(market: Address | MarketEntity): MarketEntity {
        return typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
    }
}
