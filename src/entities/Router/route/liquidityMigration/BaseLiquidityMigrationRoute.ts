import { BaseRoute, BaseRouteConfig, RouteDebugInfo } from '../BaseRoute';
import { MetaMethodType } from '../../../../contracts';
import { _RemoveLiquiditySingleTokenRoute, BaseZapOutRouteConfig, ZapOutRouteDebugInfo } from '../zapOut';
import { BaseZapInRoute, ZapInRouteDebugInfo } from '../zapIn';
import { BN, Address, NoArgsCache, BigNumberish } from '../../../../common';
import { FixedRouterMetaMethodExtraParams } from '../../types';

export type BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<
    SelfType extends BaseLiquidityMigrationFixTokenRedeemSyRoute<any>
> = BaseRouteConfig<SelfType> & {
    removeLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper;
};

export type LiquidityMigrationFixTokenRedeemSyRouteDebugInfo = RouteDebugInfo & {
    type: 'liquidityMigration';
    zapOut: ZapOutRouteDebugInfo;
    zapIn: ZapInRouteDebugInfo | undefined;
};

export abstract class BaseLiquidityMigrationFixTokenRedeemSyRoute<
    SelfType extends BaseLiquidityMigrationFixTokenRedeemSyRoute<SelfType>,
    AddLiquidityRouteType extends BaseZapInRoute<any, any> = BaseZapInRoute<any, any>
> extends BaseRoute<SelfType> {
    readonly removeLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper;

    constructor(params: BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<SelfType>) {
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

    abstract withRemoveLiquidityRoute(
        newRemoveLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper
    ): SelfType;

    @NoArgsCache
    async createAddLiquidityRoute(): Promise<AddLiquidityRouteType | undefined> {
        return this.createAddLiquidityRouteImplement();
    }

    override async getNetOut() {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.getNetOut();
    }

    override async estimateNetOutInEth() {
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        return addLiquidityRoute?.estimateNetOutInEth();
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

export class PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper extends _RemoveLiquiditySingleTokenRoute<PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper> {
    readonly redeemRewards: boolean;

    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper> & {
            redeemRewards?: boolean;
        }
    ) {
        super(market, lpToRemove, tokenOut, slippage, params);
        this.redeemRewards = params.redeemRewards ?? false;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCallForRouterHelper({}, this.routerExtraParams);
        return mm?.estimateGas();
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
        /**
         * The user only need to approve the routerHelper, not the router.
         * However, the _precise_ calculation required the router to be approved in order
         * to do the contract simulation.
         *
         * Now we return the router address instead.
         */
        return this.router.address;
        // return this.router.getRouterHelper().address;
    }
}
