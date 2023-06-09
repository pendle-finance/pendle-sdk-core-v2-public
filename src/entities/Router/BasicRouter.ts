import { MetaMethodType } from '../../contracts';
import { areSameAddresses } from '../../common';

import {
    BaseZapInRoute,
    BaseZapOutRoute,
    BaseZapInRouteData,
    BaseZapOutRouteIntermediateData,
    BaseLiquidityMigrationFixTokenRedeemSyRoute,
} from './route';

import { BaseRouter } from './BaseRouter';
import { BaseRouterConfig } from './types';
import { getContractAddresses } from '../../common';

export type BasicRouterConfig = BaseRouterConfig;

/**
 * @privateRemarks
 * TODO force this class to use a special aggregator helper instead of {@link KyberHelper}.
 * (that is, a aggregator helper that always return none).
 */
export class BasicRouter extends BaseRouter {
    /**
     * Create a Router object for a given config.
     * @remarks
     * The address of {@link Router} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getBasicRouter(config: BasicRouterConfig): BaseRouter {
        return new BasicRouter(getContractAddresses(config.chainId).ROUTER, config);
    }

    /**
     * @returns the route having tokenMintSy equals its source token.
     */
    override async findBestZapInRoute<
        ZapInRoute extends BaseZapInRoute<MetaMethodType, BaseZapInRouteData, ZapInRoute>
    >(routes: ZapInRoute[]): Promise<ZapInRoute> {
        return Promise.resolve(
            routes.filter((route) => areSameAddresses(route.sourceTokenAmount.token, route.tokenMintSy))[0]
        );
    }

    /**
     * @returns the route having tokenRedeemSy equals its target token.
     */
    override async findBestZapOutRoute<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(routes: ZapOutRoute[]): Promise<ZapOutRoute> {
        return Promise.resolve(routes.filter((route) => areSameAddresses(route.targetToken, route.tokenRedeemSy))[0]);
    }

    /**
     * @returns the route that does not use aggregator
     */
    override async findBestLiquidityMigrationRoute<
        LiquidityMigrationRoute extends BaseLiquidityMigrationFixTokenRedeemSyRoute<any, any, any>
    >(routes: LiquidityMigrationRoute[]): Promise<LiquidityMigrationRoute> {
        return routes.filter((route) => areSameAddresses(route.tokenRedeemSy, route.tokenMintSy))[0];
    }
}
