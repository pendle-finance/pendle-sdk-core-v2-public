import {
    BaseLiquidityMigrationFixTokenRedeemSyRoute,
    BaseLiquidityMigrationFixTokenRedeemSyRouteConfig,
    PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper,
} from './BaseLiquidityMigrationRoute';
import { AddLiquiditySingleTokenKeepYtRoute, AddLiquiditySingleTokenKeepYtRouteConfig } from '../zapIn';
import { RemoveLiquiditySingleTokenRoute } from '../zapOut';
import { MetaMethodType } from '../../../../contracts';
import { FixedRouterMetaMethodExtraParams, TokenOutput, RouterHelperMetaMethodReturnType } from '../../types';
import { BN, Address, calcSlippedDownAmount, NoArgsCache } from '../../../../common';

export type LiquidityMigrationFixTokenRedeemSyKeepYtRouteConfig<T extends MetaMethodType> =
    BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<T, LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>> & {
        addLiquidityRouteConfig: {
            destinationMarket: Address;
            params: AddLiquiditySingleTokenKeepYtRouteConfig<T>;
        };
        redeemRewards: boolean;
        slippage: number;
    };

export class LiquidityMigrationFixTokenRedeemSyKeepYtRoute<
    T extends MetaMethodType
> extends BaseLiquidityMigrationFixTokenRedeemSyRoute<
    T,
    LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>,
    AddLiquiditySingleTokenKeepYtRoute<T>
> {
    override readonly routeName = 'LiquidityMigrationFixTokenRedeemSyKeepYt';
    readonly redeemRewards: boolean;
    readonly slippage: number;
    readonly addLiquidityRouteConfig: LiquidityMigrationFixTokenRedeemSyKeepYtRouteConfig<T>['addLiquidityRouteConfig'];

    constructor(params: LiquidityMigrationFixTokenRedeemSyKeepYtRouteConfig<T>) {
        super(params);
        this.redeemRewards = params.redeemRewards;
        this.slippage = params.slippage;
        this.addLiquidityRouteConfig = params.addLiquidityRouteConfig;
    }

    override get tokenMintSy() {
        return this.addLiquidityRouteConfig.params.tokenMintSy;
    }

    override async createAddLiquidityRouteImplement(): Promise<AddLiquiditySingleTokenKeepYtRoute<T> | undefined> {
        const netTokenToZap = await this.removeLiquidityRoute.getNetOut();
        if (!netTokenToZap) {
            return undefined;
        }
        return new AddLiquiditySingleTokenKeepYtRoute(
            this.addLiquidityRouteConfig.destinationMarket,
            this.removeLiquidityRoute.tokenOut,
            netTokenToZap,
            this.slippage,
            this.addLiquidityRouteConfig.params
        );
    }
    override removeLiquidityRouteWithBulkSeller(
        withBulkSeller = true
    ): LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T> {
        return this.withRemoveLiquidityRoute(
            withBulkSeller
                ? this.getRemoveLiquidityRouteWithBulkSeller()
                : this.getRemoveLiquidityRouteWithoutBulkSeller()
        );
    }

    override withRemoveLiquidityRoute(
        newRemoveLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper<T>
    ) {
        return new LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>({
            context: this.context,
            withBulkSeller: this.withBulkSeller,
            cloneFrom: this,
            redeemRewards: this.redeemRewards,
            removeLiquidityRoute: newRemoveLiquidityRoute,
            addLiquidityRouteConfig: this.addLiquidityRouteConfig,
            slippage: this.slippage,
        });
    }

    override addLiquidityRouteWithBulkSeller(withBulkSeller = true): LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T> {
        let cachedAddLiqRoute: any = undefined;
        {
            /* eslint-disable @typescript-eslint/unbound-method */
            const createAddLiquidityRouteFn =
                BaseLiquidityMigrationFixTokenRedeemSyRoute.prototype.createAddLiquidityRoute;
            if (NoArgsCache.checkProperty(this, createAddLiquidityRouteFn)) {
                cachedAddLiqRoute = NoArgsCache.getValue(this, createAddLiquidityRouteFn);
            }
            /* eslint-enable @typescript-eslint/unbound-method */
        }
        return new LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>({
            context: this.context,
            withBulkSeller,
            cloneFrom: this,
            redeemRewards: this.redeemRewards,
            removeLiquidityRoute: this.removeLiquidityRoute,
            addLiquidityRouteConfig: {
                destinationMarket: this.addLiquidityRouteConfig.destinationMarket,
                params: {
                    ...this.addLiquidityRouteConfig.params,
                    cloneFrom: cachedAddLiqRoute,
                    withBulkSeller,
                },
            },
            slippage: this.slippage,
        });
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.context.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterHelperMetaMethodReturnType<
        T,
        'transferLiquidityDifferentSyKeepYt',
        {
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute<T>;
            addLiquidityRoute: AddLiquiditySingleTokenKeepYtRoute<T>;
            route: LiquidityMigrationFixTokenRedeemSyKeepYtRoute<T>;
        }
    > {
        const addLiquidityRoute = (await this.createAddLiquidityRoute())!;
        const res = await this.buildGenericCall(
            {
                route: this,
                removeLiquidityRoute: this.removeLiquidityRoute,
                addLiquidityRoute,
            },
            this.routerExtraParams
        );
        return res!;
    }

    /**
     * @privateRemarks
     * The whole process looks like this:
     *              (1)                             (2)                             (3)
     *      LP1 -----------> tokenRedeemSy (X) -------------> tokenMintSy (Y) ---------------> LP2
     *
     * In SDK, (1) is handled via this.removeLiquidityRoute, while (2) + (3) is handled via addLiquidityRoute
     *
     * To integrate with the contract, however, the first input should be responsible for (1) + (2), and
     * the second one for the (3).
     *
     * So before calling the contract, we need to mix the parameters a bit.
     */
    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const routerHelper = this.router.getRouterHelper();
        const addLiquidityRoute = await this.createAddLiquidityRoute();
        if (!addLiquidityRoute) {
            return undefined;
        }
        const [
            removeLiqTokenOutputStruct,
            addLiqAggregatorResult,
            addLiqTokenInputStruct,
            addLiqMinLpOut,
            addLiqMinYtOut,
            addLiqUsedBulk,
        ] = await Promise.all([
            this.removeLiquidityRoute.buildTokenOutput(),
            addLiquidityRoute.getAggregatorResult(),
            addLiquidityRoute.buildTokenInput(),
            addLiquidityRoute.getMinLpOut(),
            addLiquidityRoute.getMinYtOut(),
            addLiquidityRoute.getUsedBulk(),
        ]);
        if (
            !removeLiqTokenOutputStruct ||
            !addLiqAggregatorResult ||
            !addLiqTokenInputStruct ||
            !addLiqMinYtOut ||
            !addLiqMinLpOut
        ) {
            return;
        }

        const tokenMintDstSyAmount = addLiqAggregatorResult.outputAmount;

        const swapData = addLiqAggregatorResult.createSwapData({ needScale: true });
        const pendleSwap = this.router.getPendleSwapAddress(swapData.swapType);
        const newTokenOutput: TokenOutput = {
            tokenRedeemSy: removeLiqTokenOutputStruct.tokenRedeemSy,
            bulk: removeLiqTokenOutputStruct.bulk,
            tokenOut: addLiquidityRoute.tokenMintSy,
            minTokenOut: calcSlippedDownAmount(tokenMintDstSyAmount, this.slippage),
            swapData,
            pendleSwap,
        };

        return routerHelper.metaCall.transferLiquidityDifferentSyKeepYt(
            {
                market: this.removeLiquidityRoute.market,
                doRedeemRewards: this.redeemRewards,
                netLpToRemove: this.removeLiquidityRoute.lpToRemove,
                output: newTokenOutput,
            },
            {
                market: addLiquidityRoute.market,
                bulk: addLiqUsedBulk,
                minLpOut: addLiqMinLpOut,
                minYtOut: addLiqMinYtOut,
            },
            {
                ...params,
                ...data,
            }
        );
    }
}
