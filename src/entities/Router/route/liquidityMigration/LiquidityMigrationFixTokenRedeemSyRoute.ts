import {
    BaseLiquidityMigrationFixTokenRedeemSyRoute,
    BaseLiquidityMigrationFixTokenRedeemSyRouteConfig,
    PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper,
} from './BaseLiquidityMigrationRoute';
import { BaseAddLiquiditySingleTokenRoute, AddLiquiditySingleTokenRouteConfig } from '../zapIn';
import { RemoveLiquiditySingleTokenRoute } from '../zapOut';
import { MetaMethodType } from '../../../../contracts';
import { FixedRouterMetaMethodExtraParams, TokenOutput, RouterHelperMetaMethodReturnType } from '../../types';
import { BN, Address, calcSlippedDownAmount } from '../../../../common';

export type LiquidityMigrationFixTokenRedeemSyRouteConfig =
    BaseLiquidityMigrationFixTokenRedeemSyRouteConfig<LiquidityMigrationFixTokenRedeemSyRoute> & {
        addLiquidityRouteConfig: {
            destinationMarket: Address;
            params: AddLiquiditySingleTokenRouteConfig<AddLiquiditySingleTokenForMigrationRoute>;
        };
        redeemRewards: boolean;
        slippage: number;
    };

export class LiquidityMigrationFixTokenRedeemSyRoute extends BaseLiquidityMigrationFixTokenRedeemSyRoute<
    LiquidityMigrationFixTokenRedeemSyRoute,
    AddLiquiditySingleTokenForMigrationRoute
> {
    override readonly routeName = 'LiquidityMigrationFixTokenRedeemSy';
    readonly redeemRewards: boolean;
    readonly slippage: number;
    readonly addLiquidityRouteConfig: LiquidityMigrationFixTokenRedeemSyRouteConfig['addLiquidityRouteConfig'];

    constructor(params: LiquidityMigrationFixTokenRedeemSyRouteConfig) {
        super(params);
        this.redeemRewards = params.redeemRewards;
        this.slippage = params.slippage;
        this.addLiquidityRouteConfig = params.addLiquidityRouteConfig;
    }

    override get tokenMintSy() {
        return this.addLiquidityRouteConfig.params.tokenMintSy;
    }

    override async createAddLiquidityRouteImplement(): Promise<AddLiquiditySingleTokenForMigrationRoute | undefined> {
        const netTokenToZap = await this.removeLiquidityRoute.getNetOut();
        if (!netTokenToZap) {
            return undefined;
        }
        return new AddLiquiditySingleTokenForMigrationRoute(
            this.addLiquidityRouteConfig.destinationMarket,
            this.removeLiquidityRoute.tokenOut,
            netTokenToZap,
            this.slippage,
            this.addLiquidityRouteConfig.params
        );
    }

    override withRemoveLiquidityRoute(newRemoveLiquidityRoute: PatchedRemoveLiquiditySingleTokenRouteWithRouterHelper) {
        return new LiquidityMigrationFixTokenRedeemSyRoute({
            context: this.context,
            cloneFrom: this,
            redeemRewards: this.redeemRewards,
            removeLiquidityRoute: newRemoveLiquidityRoute,
            addLiquidityRouteConfig: this.addLiquidityRouteConfig,
            slippage: this.slippage,
        });
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.context.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterHelperMetaMethodReturnType<
        'meta-method',
        'transferLiquidityDifferentSyNormal',
        {
            removeLiquidityRoute: RemoveLiquiditySingleTokenRoute;
            addLiquidityRoute: AddLiquiditySingleTokenForMigrationRoute;
            route: LiquidityMigrationFixTokenRedeemSyRoute;
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
            addLiqApproxParam,
            addLiqMinLpOut,
        ] = await Promise.all([
            this.removeLiquidityRoute.buildTokenOutput(),
            addLiquidityRoute.getAggregatorResult(),
            addLiquidityRoute.buildTokenInput(),
            addLiquidityRoute.getApproxParam(),
            addLiquidityRoute.getMinLpOut(),
        ]);
        if (!removeLiqTokenOutputStruct || !addLiqTokenInputStruct || !addLiqApproxParam || !addLiqMinLpOut) {
            return;
        }

        const tokenMintDstSyAmount = addLiqAggregatorResult.outputAmount;

        const swapData = addLiqAggregatorResult.createSwapData({ needScale: true });
        const pendleSwap = this.router.getPendleSwapAddress(swapData.swapType);
        const newTokenOutput: TokenOutput = {
            tokenRedeemSy: removeLiqTokenOutputStruct.tokenRedeemSy,
            tokenOut: addLiquidityRoute.tokenMintSy,
            minTokenOut: calcSlippedDownAmount(tokenMintDstSyAmount, this.slippage),
            swapData,
            pendleSwap,
        };

        return routerHelper.metaCall.transferLiquidityDifferentSyNormal(
            {
                market: this.removeLiquidityRoute.market,
                doRedeemRewards: this.redeemRewards,
                netLpToRemove: this.removeLiquidityRoute.lpToRemove,
                output: newTokenOutput,
            },
            {
                market: addLiquidityRoute.getMarketAddress(),
                guessNetTokenIn: tokenMintDstSyAmount,
                guessPtReceivedFromSy: addLiqApproxParam,
                minLpOut: addLiqMinLpOut,
            },
            {
                ...params,
                ...data,
            }
        );
    }
}

export class AddLiquiditySingleTokenForMigrationRoute extends BaseAddLiquiditySingleTokenRoute<AddLiquiditySingleTokenForMigrationRoute> {
    getNeedScale() {
        return true;
    }
}
