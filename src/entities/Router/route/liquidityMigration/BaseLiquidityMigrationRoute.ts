import { BaseRoute, BaseRouteConfig, RouteDebugInfo } from '../BaseRoute';
import { MetaMethodType } from '../../../../contracts';
import { _RemoveLiquiditySingleTokenRoute, BaseZapOutRouteConfig, ZapOutRouteDebugInfo } from '../zapOut';
import { BaseZapInRoute, ZapInRouteDebugInfo } from '../zapIn';
import { BN, Address, NoArgsCache, BigNumberish } from '../../../../common';
import { RouteContext } from '../RouteContext';
import { FixedRouterMetaMethodExtraParams } from '../../types';

export type BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseLiquidityMigrationFixTokenRedeemSyRoute<T, any>
> = BaseRouteConfig<T, SelfType> & {
    removeLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>;
};

export type LiquidityMigrationFixTokenRedeemSyRouteDebugInfo = RouteDebugInfo & {
    type: 'liquidityMigration';
    zapOut: ZapOutRouteDebugInfo;
    zapIn: ZapInRouteDebugInfo | undefined;
};

export abstract class BaseLiquidityMigrationFixTokenRedeemSyRoute<
    T extends MetaMethodType,
    SelfType extends BaseLiquidityMigrationFixTokenRedeemSyRoute<T, SelfType>,
    AddLiquidityRouteType extends BaseZapInRoute<T, any, any> = BaseZapInRoute<T, any, any>
> extends BaseRoute<T, SelfType> {
    readonly removeLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>;

    constructor(params: BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<T, SelfType>) {
        super(params);
        this.removeLiquidityRoute = params.removeLiquidityRoute;
    }

    override async getSourceTokenAmount() {
        return this.removeLiquidityRoute.getSourceTokenAmount();
    }

    get tokenRedeemSy() {
        return this.removeLiquidityRoute.tokenRedeemSy;
    }

    abstract get tokenMintSy(): Address;

    abstract createAddLiquidityRouteImplement(): Promise<AddLiquidityRouteType | undefined>;
    abstract getGasUsedImplement(): Promise<BN | undefined>;

    abstract addLiquidityRouteWithBulkSeller(withBulkSeller?: boolean): SelfType;
    abstract removeLiquidityRouteWithBulkSeller(withBulkSeller?: boolean): SelfType;

    abstract withRemoveLiquidityRoute(
        newRemoveLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>
    ): SelfType;

    /**
     * @remarks
     * **Premature optimization**. Cache the remove liquidity route **with* bulk seller so
     * it won't be created twice.
     */
    @RouteContext.NoArgsSharedCache
    protected getRemoveLiquidityRouteWithBulkSeller() {
        return this.removeLiquidityRoute.withBulkSeller
            ? this.removeLiquidityRoute
            : this.removeLiquidityRoute.routeWithBulkSeller(true);
    }

    /**
     * @remarks
     * **Premature optimization**. Cache the remove liquidity route **without** bulk seller so
     * it won't be created twice.
     */
    @RouteContext.NoArgsSharedCache
    protected getRemoveLiquidityRouteWithoutBulkSeller() {
        return this.removeLiquidityRoute.withBulkSeller
            ? this.removeLiquidityRoute.routeWithBulkSeller(false)
            : this.removeLiquidityRoute;
    }

    override routeWithBulkSeller(withBulkSeller?: boolean) {
        return this.removeLiquidityRouteWithBulkSeller(withBulkSeller);
    }

    @NoArgsCache
    async createAddLiquidityRoute(): Promise<AddLiquidityRouteType | undefined> {
        return this.createAddLiquidityRouteImplement();
    }

    override get tokenBulk() {
        return this.removeLiquidityRoute.tokenBulk;
    }

    override async getNetOut() {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.getNetOut();
    }

    override async estimateNetOutInEth() {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.estimateNetOutInEth();
    }

    override async getTokenAmountForBulkTrade() {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.getTokenAmountForBulkTrade();
    }

    async addLiquidityHasBulkSeller(): Promise<boolean> {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.hasBulkSeller() ?? false;
    }

    async removeLiquidityHasBulkSeller(): Promise<boolean> {
        return this.removeLiquidityRoute.hasBulkSeller();
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.removeLiquidityRoute.signerHasApprovedImplement(signerAddress);
    }

    // TODO better typing to get more info
    override async gatherDebugInfo(): Promise<LiquidityMigrationFixTokenRedeemSyRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            type: 'liquidityMigration',
            zapIn: await this.createAddLiquidityRoute().then((route) => route?.gatherDebugInfo()),
            zapOut: await this.removeLiquidityRoute.gatherDebugInfo(),
        };
    }
}

export class PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<
    T extends MetaMethodType
> extends _RemoveLiquiditySingleTokenRoute<T, PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>> {
    readonly redeemRewards: boolean;

    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>> & {
            redeemRewards?: boolean;
        }
    ) {
        super(market, lpToRemove, tokenOut, slippage, params);
        this.redeemRewards = params.redeemRewards ?? false;
    }

    override routeWithBulkSeller(withBulkSeller = true): PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T> {
        return new PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper(
            this.market,
            this.lpToRemove,
            this.tokenOut,
            this.slippage,
            {
                context: this.context,
                tokenRedeemSy: this.tokenRedeemSy,
                withBulkSeller,
                redeemRewards: this.redeemRewards,
            }
        );
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCallForRouterHelper({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    /**
     * @privateRemarks
     * - The `TokenOutput` struct obtained from `this.buildTokenOutput()` is
     * not the same as the `TokenOutput` struct for a migrate liquidity route.
     * Here, we **purely** consider removing liquidity to an output token (of
     * the source market), **without** swapping it to another input token (of
     * the destination market).
     *
     * - The super class passed in the _receiver_. In router helper, however,
     * the receiver is the router. This is correct, as router is also used in
     * the actual liquidity migration process.
     */
    protected async buildGenericCallForRouterHelper<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const output = await this.buildTokenOutput();
        if (!output) return;
        return this.router.getRouterHelper().metaCall.removeLiquiditySingleToken(
            {
                market: this.market,
                doRedeemRewards: this.redeemRewards,
                netLpToRemove: this.lpToRemove,
                output,
            },
            { ...params, ...data }
        );
    }

    protected override getSpenderAddress() {
        return this.router.getRouterHelper().address;
    }
}
