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
    assertDefined,
    bnMax,
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
    IPAllActionV3,
    SwapData,
    TokenInput,
} from './types';
import * as routerTypes from './types';

import { BaseRoute, RouteContext } from './route';
import { txOverridesValueFromTokenInput } from './route/helper';
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

import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as limitOrder from './limitOrder';
import * as EE from 'eventemitter3';

export abstract class BaseRouter extends PendleEntity {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly EPS = 1e-3;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: BaseRouter.MIN_AMOUNT,
        guessMax: BaseRouter.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 256,
        eps: new BigNumber(BaseRouter.EPS).shiftedBy(18).toFixed(0),
    };

    readonly aggregatorHelper: AggregatorHelper<true>;
    readonly chainId: ChainId;
    readonly gasFeeEstimator: GasFeeEstimator;
    readonly checkErrorOnSimulation: boolean;
    readonly limitOrderMatcher: limitOrder.LimitOrderMatcher;
    readonly events = new EE.EventEmitter<routerTypes.RouterEvents, BaseRouter>();

    constructor(readonly address: Address, config: BaseRouterConfig) {
        super(address, { abi: IPAllActionV3ABI, ...config });
        this.chainId = config.chainId;
        this.aggregatorHelper = forceAggregatorHelperToCheckResult(
            config.aggregatorHelper ?? new VoidAggregatorHelper()
        );
        this.gasFeeEstimator = config.gasFeeEstimator ?? new GasFeeEstimator(this.provider!);
        this.checkErrorOnSimulation = config.checkErrorOnSimulation ?? false;
        this.limitOrderMatcher = config.limitOrderMatcher ?? limitOrder.VoidLimitOrderMatcher.INSTANCE;
    }

    @NoArgsCache
    getRouterHelper(): WrappedContract<typechain.PendleRouterHelper> {
        return createContractObject<typechain.PendleRouterHelper>(
            getContractAddresses(this.chainId).ROUTER_HELPER,
            abis.PendleRouterHelperABI,
            this.entityConfig
        );
    }

    abstract findBestZapInRoute<ZapInRoute extends BaseZapInRoute<BaseZapInRouteData, ZapInRoute>>(
        routes: ZapInRoute[]
    ): Promise<ZapInRoute>;
    abstract findBestZapOutRoute<ZapOutRoute extends BaseZapOutRoute<BaseZapOutRouteIntermediateData, ZapOutRoute>>(
        routes: ZapOutRoute[]
    ): Promise<ZapOutRoute>;
    abstract findBestLiquidityMigrationRoute<
        LiquidityMigrationRoute extends liqMigrationRoutes.BaseLiquidityMigrationFixTokenRedeemSyRoute<any, any>
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

    // async _getMarketStaticMath(params: {
    //     market: Address | MarketEntity;
    //     yt?: Address | YtEntity;
    //     pyIndex?: offchainMath.PyIndex;
    //     blockTimestamp?: number;
    //     blockTag?: number | string | Promise<number | string>;
    // }): Promise<offchainMath.MarketStaticMath> {
    //     const market =
    //         typeof params.market === 'string' ? new MarketEntity(params.market, this.entityConfig) : params.market;
    //     const { marketStaticMath } = await market.getMarketInfo({});
    //     const [marketState, pyIndex, blockTimestamp] = await Promise.all([
    //         market.readState(),
    //         params.pyIndex ??
    //             (async () => {
    //                 if (!params.yt) return market.ytEntity();
    //                 if (typeof params.yt === 'string') return new YtEntity(params.yt, this.entityConfig);
    //                 return params.yt;
    //             })().then((yt) => yt.pyIndexCurrent()),
    //         params.blockTimestamp ?? provider.getBlock(params.blockTag ?? 'latest').then((block) => block.timestamp),
    //     ]);
    //     return marketStaticMath;
    // }

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

    getApproxParamsToPullPt(guessAmountOut: BN | bigint, slippage: number): ApproxParamsStruct {
        return {
            ...BaseRouter.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountOut, 1 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountOut, 5 * slippage),
            guessOffchain: guessAmountOut,
            maxIteration: this.calcMaxIteration(slippage),
        };
    }

    getApproxParamsToPushPt(guessAmountIn: BN | bigint, slippage: number): ApproxParamsStruct {
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
        zapInRoutes.AddLiquidityDualTokenAndPtRouteData & {
            route: AddLiquidityDualTokenAndPtRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketAddr = marketEntity.address;
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<AddLiquidityDualTokenAndPtRoute>({
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
        const metaMethod = await bestRoute.buildCall();
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
            marketStaticMathBefore: offchainMath.MarketStaticMath;
            marketStaticMathAfter: offchainMath.MarketStaticMath;
            limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };

        const marketAddr = this.getMarketAddress(market);
        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const pureMarketAddLiqResult = marketStaticMath.addLiquiditySinglePtStatic(BN.from(netPtIn).toBigInt());

        let netPtRemains = BN.from(netPtIn);
        let netSyHolding = BN.from(0);
        const limitOrderMatchedResult = await this.limitOrderMatcher.swapPtForSy(
            market,
            BN.from(pureMarketAddLiqResult.netPtToSwap),
            { routerMethod: 'addLiquiditySinglePt' }
        );
        netPtRemains = bnMax(0, netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker));
        netSyHolding = netSyHolding.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.addLiquiditySinglePtStatic(netPtRemains.toBigInt(), {
            netSyHolding: netSyHolding.toBigInt(),
        });
        const netLpOut = BN.from(marketResult.netLpOut);
        const netPtToSwap = BN.from(marketResult.netPtToSwap);
        const approxParam = this.getApproxParamsToPushPt(netPtToSwap, slippage);
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: different slip down amount function
        const metaMethod = await this.contract.metaCall.addLiquiditySinglePt(
            params.receiver,
            marketAddr,
            netPtIn,
            minLpOut,
            approxParam,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...params,
                ...marketResult,
                netLpOut,
                netPtToSwap,
                netSyFromSwap: BN.from(marketResult.netSyFromSwap),
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                marketStaticMathBefore: marketStaticMath,
                marketStaticMathAfter: marketResult.afterMath,
                approxParam,
                minLpOut,
                limitOrderMatchedResult,
            }
        );
        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
            netSyToSwap: BN;
            netSyFeeFromMarket: BN;
            netSyFeeFromLimit: BN;
            priceImpact: offchainMath.FixedX18;
            exchangeRateAfter: offchainMath.MarketExchangeRate;
            approxParam: ApproxParamsStruct;
            minLpOut: BN;
        }
    > {
        netSyIn = BN.from(netSyIn);
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);

        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const pureMarketAddLiqResult = marketStaticMath.addLiquiditySingleSyStatic(netSyIn.toBigInt());

        let netSyRemains = BN.from(netSyIn);
        let netPtHolding = BN.from(0);

        const limitOrderMatchedResult = await this.limitOrderMatcher.swapSyForPt(
            market,
            BN.from(pureMarketAddLiqResult.netSyToSwap),
            { routerMethod: 'addLiquiditySingleSy' }
        );
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        netPtHolding = netPtHolding.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.addLiquiditySingleSyStatic(netSyRemains.toBigInt(), {
            netPtHolding: netPtHolding.toBigInt(),
        });
        const approxParam = this.getApproxParamsToPullPt(marketResult.netPtFromSwap, slippage);
        const minLpOut = calcSlippedDownAmountSqrt(marketResult.netLpOut, slippage); // note: different slip down amount function

        const metaMethod = await this.contract.metaCall.addLiquiditySingleSy(
            params.receiver,
            marketAddr,
            netSyIn,
            minLpOut,
            approxParam,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
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
            }
        );
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
        zapInRoutes.AddLiquiditySingleTokenRouteData & {
            route: AddLiquiditySingleTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        market = this.getMarketEntity(market);
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<AddLiquiditySingleTokenRoute>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();

        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new AddLiquiditySingleTokenRoute(market, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );

        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('add liquidity', tokenIn, marketAddr, { cause })
        );

        const [marketStaticMath, input, noLimitOrderPreviewResult] = await Promise.all([
            bestRoute.getMarketStaticMath(),
            bestRoute.buildTokenInput().then(assertDefined),
            bestRoute.preview().then(assertDefined),
            bestRoute.getMintedSyAmount().then(assertDefined),
        ]);
        const limitOrderMatchedResult = await this.limitOrderMatcher.swapSyForPt(
            market,
            noLimitOrderPreviewResult.netSyToSwap,
            { routerMethod: 'addLiquiditySingleToken' }
        );
        const netSyAfterLimit = noLimitOrderPreviewResult.netSyMinted.sub(limitOrderMatchedResult.netInputFromTaker);
        const netPtReceivedAfterLimit = BN.from(limitOrderMatchedResult.netOutputToTaker);
        const marketResult = marketStaticMath.addLiquiditySingleSyStatic(netSyAfterLimit.toBigInt(), {
            netPtHolding: netPtReceivedAfterLimit.toBigInt(),
        });
        const approxParams = this.getApproxParamsToPullPt(marketResult.netPtFromSwap, slippage);
        const netLpOut = BN.from(marketResult.netLpOut);
        const minLpOut = calcSlippedDownAmountSqrt(netLpOut, slippage); // note: sqrtthe slipdown function

        const overrides = txOverridesValueFromTokenInput(input);
        const metaMethod = await this.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            marketAddr,
            minLpOut,
            approxParams,
            input,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...mergeMetaMethodExtraParams({ overrides }, params),

                netLpOut,
                netPtFromSwap: BN.from(marketResult.netPtFromSwap),
                netPtReceivedAfterLimit,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                netSyToSwap: BN.from(marketResult.netSyToSwap),
                netSyMinted: noLimitOrderPreviewResult.netSyMinted,
                intermediateSyAmount: noLimitOrderPreviewResult.netSyMinted,

                minLpOut,
                route: bestRoute,
            }
        );

        this.events.emit('calculationFinalized', { metaMethod });
        return metaMethod.executeWithMethod(_params);
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
        RouterMetaMethodReturnType<
            T,
            'addLiquiditySingleTokenKeepYt',
            zapInRoutes.AddLiquiditySingleTokenKeepYtRouteData & {
                route: AddLiquiditySingleTokenKeepYtRoute;
            }
        >
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        market = this.getMarketEntity(market);
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<AddLiquiditySingleTokenKeepYtRoute>({
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
        const metaMethod = await bestRoute.buildCall();
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
        zapOutRoutes.RemoveLiquidityDualTokenAndPtRouteIntermediateData & {
            route: RemoveLiquidityDualTokenAndPtRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        market = this.getMarketEntity(market);

        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<RemoveLiquidityDualTokenAndPtRoute>({
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

        const metaMethod = await bestRoute.buildCall();
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);

        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const removeLiqResult = marketStaticMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt());
        let totalPtOut = BN.from(removeLiqResult.netPtOut);
        let netSyRemains = BN.from(removeLiqResult.netSyOut);

        const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;
        const limitOrderMatchedResult = await this.limitOrderMatcher.swapSyForPt(market, netSyRemains, {
            routerMethod: 'removeLiquiditySinglePt',
        });
        totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);

        const swapSyForPtResult = afterLiqRemovalMarketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
        totalPtOut = totalPtOut.add(swapSyForPtResult.netPtOut);
        // netSyRemains should be zero by now

        const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);

        const metaMethod = await this.contract.metaCall.removeLiquiditySinglePt(
            params.receiver,
            marketAddr,
            lpToRemove,
            minPtOut,
            this.getApproxParamsToPullPt(swapSyForPtResult.netPtOut, slippage),
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);

        const marketStaticMath = await this.getMarketStaticMathWithParams(market, params);
        const removeLiqResult = marketStaticMath.removeLiquidityDualSyAndPtStatic(BN.from(lpToRemove).toBigInt());
        let totalSyOut = BN.from(removeLiqResult.netSyOut);
        let netPtRemains = BN.from(removeLiqResult.netPtOut);

        const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;
        const limitOrderMatchedResult = await this.limitOrderMatcher.swapPtForSy(market, netPtRemains, {
            routerMethod: 'removeLiquiditySingleSy',
        });
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);
        netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);

        const swapPtToSyResult = afterLiqRemovalMarketStaticMath.swapExactPtForSyStaticAllowExpired(
            netPtRemains.toBigInt()
        );
        totalSyOut = totalSyOut.add(swapPtToSyResult.netSyOut);
        // netPtRemains should be zero by now

        const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);

        const metaMethod = await this.contract.metaCall.removeLiquiditySingleSy(
            params.receiver,
            marketEntity.address,
            lpToRemove,
            minSyOut,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
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
            }
        );
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
        zapOutRoutes.RemoveLiquiditySingleTokenRouteIntermediateData & {
            route: RemoveLiquiditySingleTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        market = this.getMarketEntity(market);
        const marketAddr = market.address;
        const syEntity = await market.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<RemoveLiquiditySingleTokenRoute>({
            params,
            syEntity,
            slippage,
        });
        const tokenRedeemSyList = await routeContext.getTokensRedeemSy();
        const routes = tokenRedeemSyList.map(
            (tokenRedeemSy) =>
                new RemoveLiquiditySingleTokenRoute(market, lpToRemove, tokenOut, slippage, {
                    context: routeContext,
                    tokenRedeemSy,
                })
        );
        const bestRoute = await this.findBestZapOutRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('zap out', marketAddr, tokenOut, { cause })
        );

        const metaMethod = await bestRoute.buildCall();
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketAddr = this.getMarketAddress(market);

        let netPtRemains = BN.from(exactPtIn);
        let totalSyOut = BN.from(0);

        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.limitOrderMatcher.swapPtForSy(market, netPtRemains, { routerMethod: 'swapExactPtForSy' }),
            this.getMarketStaticMathWithParams(market, params),
        ]);
        netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactPtForSyStatic(netPtRemains.toBigInt());
        totalSyOut = totalSyOut.add(marketResult.netSyOut);
        // netPtRemains should be zero by now

        const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactPtForSy(
            params.receiver,
            marketAddr,
            exactPtIn,
            minSyOut,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...params,
                netSyOut: totalSyOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minSyOut,
            }
        );
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
        zapInRoutes.SwapExactTokenForPtRouteData & {
            route: SwapExactTokenForPtRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<SwapExactTokenForPtRoute>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForPtRoute(marketEntity, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', tokenIn, await marketEntity.pt(), { cause })
        );

        const [marketStaticMath, input, mintedSyAmount] = await Promise.all([
            bestRoute.getMarketStaticMath(),
            bestRoute.buildTokenInput().then(assertDefined),
            bestRoute.getMintedSyAmount().then(assertDefined),
        ]);
        let totalPtOut = BN.from(0);
        let netSyRemains = mintedSyAmount;

        const limitOrderMatchedResult = await this.limitOrderMatcher.swapSyForPt(market, netSyRemains, {
            routerMethod: 'swapExactTokenForPt',
        });
        totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);

        const marketResult = marketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
        totalPtOut = totalPtOut.add(marketResult.netPtOut);
        // netSyRemains should be zero by now

        const approxParams = this.getApproxParamsToPullPt(marketResult.netPtOut, slippage);
        const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);
        const overrides = txOverridesValueFromTokenInput(input);

        const metaMethod = await this.contract.metaCall.swapExactTokenForPt(
            params.receiver,
            marketEntity.address,
            minPtOut,
            approxParams,
            input,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...mergeMetaMethodExtraParams({ overrides }, params),
                intermediateSyAmount: mintedSyAmount,
                netPtOut: totalPtOut,
                netSyMinted: mintedSyAmount,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minPtOut,
                route: bestRoute,
                limitOrderMatchedResult,
            }
        );
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const marketAddr = marketEntity.address;

        let netSyRemains = BN.from(exactSyIn);
        let totalPtOut = BN.from(0);

        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.limitOrderMatcher.swapSyForPt(market, netSyRemains, { routerMethod: 'swapExactSyForPt' }),
            this.getMarketStaticMathWithParams(market, params),
        ]);
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalPtOut = totalPtOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactSyForPtStatic(netSyRemains.toBigInt());
        totalPtOut = totalPtOut.add(marketResult.netPtOut);
        // netSyRemains should be zero by now

        const minPtOut = calcSlippedDownAmount(totalPtOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactSyForPt(
            params.receiver,
            marketAddr,
            exactSyIn,
            minPtOut,
            this.getApproxParamsToPullPt(marketResult.netPtOut, slippage),
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...params,
                netPtOut: totalPtOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minPtOut,
            }
        );
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
        zapInRoutes.MintSyFromTokenRouteData & {
            route: MintSyFromTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.entityConfig);
        }
        const syAddr = sy.address;
        const syEntity = sy; // force type here
        const routeContext = this.createRouteContext<MintSyFromTokenRoute>({
            params,
            syEntity,
            slippage,
        });
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
        const metaMethod = await bestRoute.buildCall();
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
        zapOutRoutes.RedeemSyToTokenRouteIntermediateData & {
            route: RedeemSyToTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const syEntity = typeof sy === 'string' ? new SyEntity(sy, this.entityConfig) : sy;
        const syAddr = syEntity.address;
        const routeContext = this.createRouteContext<RedeemSyToTokenRoute>({
            params,
            syEntity,
            slippage,
        });
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
        const metaMethod = await bestRoute.buildCall();
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
        zapInRoutes.MintPyFromTokenRouteData & {
            route: MintPyFromTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const syEntity = await ytEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<MintPyFromTokenRoute>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new MintPyFromTokenRoute(ytEntity, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch((cause: unknown) =>
            this.throwNoRouteFoundError('mint', tokenIn, ytEntity.address, { cause })
        );
        const metaMethod = await bestRoute.buildCall();
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
        zapOutRoutes.RedeemPyToTokenRouteIntermediateData & {
            route: RedeemPyToTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const ytEntity = typeof yt === 'string' ? new YtEntity(yt, this.entityConfig) : yt;
        const ytAddr = ytEntity.address;
        const syEntity = await ytEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<RedeemPyToTokenRoute>({
            params,
            syEntity,
            slippage,
        });
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
        const metaMethod = await bestRoute.buildCall();
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);

        let netSyRemains = BN.from(exactSyIn);
        let totalYtOut = BN.from(0);

        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.limitOrderMatcher.swapSyForYt(market, netSyRemains, { routerMethod: 'swapExactSyForYt' }),
            this.getMarketStaticMathWithParams(market, params),
        ]);
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalYtOut = totalYtOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactSyForYtStatic(netSyRemains.toBigInt());
        totalYtOut = totalYtOut.add(marketResult.netYtOut);
        // netSyRemains should be zero by now

        const approxParams = this.getApproxParamsToPullPt(marketResult.netYtOut, slippage);
        const minYtOut = calcSlippedDownAmount(totalYtOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactSyForYt(
            params.receiver,
            marketEntity.address,
            exactSyIn,
            minYtOut,
            approxParams,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...params,
                netYtOut: totalYtOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                approxParams,
                minYtOut,
            }
        );

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
        zapOutRoutes.SwapExactPtForTokenRouteIntermediateData & {
            route: SwapExactPtForTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<SwapExactPtForTokenRoute>({
            params,
            syEntity,
            slippage,
        });
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
        const metaMethod = await bestRoute.buildCall();
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
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        let totalSyOut = BN.from(0);
        let netYtRemains = BN.from(exactYtIn);

        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.limitOrderMatcher.swapYtForSy(market, netYtRemains, { routerMethod: 'swapExactYtForSy' }),
            this.getMarketStaticMathWithParams(market, params),
        ]);
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);
        netYtRemains = netYtRemains.sub(limitOrderMatchedResult.netInputFromTaker);

        const marketResult = marketStaticMath.swapExactYtForSyStatic(netYtRemains.toBigInt());
        totalSyOut = totalSyOut.add(marketResult.netSyOut);
        // netYtRemains should be zero by now.

        const minSyOut = calcSlippedDownAmount(totalSyOut, slippage);
        const metaMethod = await this.contract.metaCall.swapExactYtForSy(
            params.receiver,
            marketEntity.address,
            exactYtIn,
            minSyOut,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...params,
                netSyOut: totalSyOut,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minSyOut,
            }
        );
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
        zapInRoutes.SwapExactTokenForYtRouteData & {
            route: SwapExactTokenForYtRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<SwapExactTokenForYtRoute>({
            params,
            syEntity,
            slippage,
        });
        const tokenMintSyList = await routeContext.getTokensMintSy();
        const routes = tokenMintSyList.map(
            (tokenMintSy) =>
                new SwapExactTokenForYtRoute(marketEntity, tokenIn, netTokenIn, slippage, {
                    context: routeContext,
                    tokenMintSy,
                })
        );
        const bestRoute = await this.findBestZapInRoute(routes).catch(async (cause: unknown) =>
            this.throwNoRouteFoundError('swap', tokenIn, await marketEntity.yt(params.forCallStatic), { cause })
        );

        const [marketStaticMath, input, mintedSyAmount] = await Promise.all([
            bestRoute.getMarketStaticMath(),
            bestRoute.buildTokenInput().then(assertDefined),
            bestRoute.getMintedSyAmount().then(assertDefined),
        ]);
        let netSyRemains = mintedSyAmount;
        let totalYtOut = BN.from(0);

        const limitOrderMatchedResult = await this.limitOrderMatcher.swapSyForYt(market, netSyRemains, {
            routerMethod: 'swapExactTokenForYt',
        });
        netSyRemains = netSyRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalYtOut = totalYtOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactSyForYtStatic(netSyRemains.toBigInt());
        totalYtOut = totalYtOut.add(marketResult.netYtOut);

        const approxParams = this.getApproxParamsToPullPt(marketResult.netYtOut, slippage);
        const minYtOut = calcSlippedDownAmount(totalYtOut, slippage);
        const overrides = txOverridesValueFromTokenInput(input);

        const metaMethod = await this.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            marketEntity.address,
            minYtOut,
            approxParams,
            input,
            limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.chainId),
            {
                ...mergeMetaMethodExtraParams({ overrides }, params),
                intermediateSyAmount: mintedSyAmount,
                netYtOut: totalYtOut,
                netSyMinted: mintedSyAmount,
                netSyFeeFromMarket: BN.from(marketResult.netSyFee),
                netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
                priceImpact: marketResult.priceImpact,
                exchangeRateAfter: marketResult.exchangeRateAfter,
                minYtOut,
                route: bestRoute,
            }
        );
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
        zapOutRoutes.SwapExactYtForTokenRouteIntermediateData & {
            route: SwapExactYtForTokenRoute;
        }
    > {
        const params = { ...this.addExtraParams(_params), method: 'meta-method' as const };
        const marketEntity = this.getMarketEntity(market);
        const syEntity = await marketEntity.syEntity(params.forCallStatic);
        const routeContext = this.createRouteContext<SwapExactYtForTokenRoute>({
            params,
            syEntity,
            slippage,
        });
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
        const metaMethod = await bestRoute.buildCall();
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
        const approxParam = this.getApproxParamsToPushPt(totalPtSwapped, slippage);
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
        const approxParam = this.getApproxParamsToPushPt(totalPtToSwap, slippage);
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
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, {
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
            this.throwNoRouteFoundError('migrate liquidity', srcMarketEntity.address, dstMarketEntity.address, {
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
        errorOptions?: PendleSdkErrorParams
    ): Promise<never> {
        this.events.emit('noRouteFound', { actionName, from, to, errorOptions });
        throw new NoRouteFoundError(actionName, from, to, errorOptions);
    }

    getMarketAddress(market: Address | MarketEntity): Address {
        return typeof market === 'string' ? market : market.address;
    }

    getMarketEntity(market: Address | MarketEntity): MarketEntity {
        return typeof market === 'string' ? new MarketEntity(market, this.entityConfig) : market;
    }
}
