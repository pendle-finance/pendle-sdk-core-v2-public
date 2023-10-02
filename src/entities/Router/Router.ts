import { MetaMethodType } from '../../contracts';
import { GasEstimationError, PendleSdkError, PendleSdkErrorParams } from '../../errors';
import { promiseAllWithErrors, zip } from '../../common';

import {
    BaseRoute,
    BaseZapInRoute,
    BaseZapOutRoute,
    BaseZapInRouteData,
    BaseZapOutRouteIntermediateData,
    BaseLiquidityMigrationFixTokenRedeemSyRoute,
} from './route';

import { BaseRouter } from './BaseRouter';
import { BaseRouterConfig } from './types';
import { getContractAddresses } from '../../common';
import { KyberSwapAggregatorHelper } from './aggregatorHelper';

export type RouterConfig = BaseRouterConfig;

/**
 * @remarks
 * As the routing algorithm try multiple routes to find the best one,
 * there are also multiple errors.
 *
 * This error is the collection of the errors from the routes.
 */
export class RoutingError extends PendleSdkError {
    constructor(
        readonly routeErrors: {
            route: BaseRoute<any, any>;
            error: unknown;
        }[],
        params?: PendleSdkErrorParams
    ) {
        super('RoutingError', params);
        // console.log(routeErrors);
    }
}

export class Router extends BaseRouter {
    /**
     * Create a Router object for a given config.
     * @remarks
     * The address of {@link Router} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getRouter(config: RouterConfig): BaseRouter {
        return new Router(getContractAddresses(config.chainId).ROUTER, config);
    }

    static getRouterWithKyberAggregator(config: Omit<RouterConfig, 'aggregatorHelper'>): BaseRouter {
        const routerAddress = getContractAddresses(config.chainId).ROUTER;
        const provider = (config.provider ?? config.signer?.provider)!;
        const aggregatorHelper = new KyberSwapAggregatorHelper(routerAddress, {
            chainId: config.chainId,
        });
        return new Router(routerAddress, {
            ...config,
            provider: provider,
            signer: config.signer,
            aggregatorHelper: aggregatorHelper,
        });
    }

    override async findBestZapInRoute<
        ZapInRoute extends BaseZapInRoute<MetaMethodType, BaseZapInRouteData, ZapInRoute>
    >(routes: ZapInRoute[]): Promise<ZapInRoute> {
        const routesWithBulkSeller = await Promise.all(
            routes.map(async (route) => {
                try {
                    if (!(await route.hasBulkSeller())) return [];
                    const routeWithBulkSeller = await this.tryZapInRouteWithBulkSeller(route);
                    return routeWithBulkSeller == undefined ? [] : [routeWithBulkSeller];
                } catch {
                    return [];
                }
            })
        ).then((result) => result.flat());
        routes = [...routes, ...routesWithBulkSeller];

        // // syncup before use
        // // TODO refactor mapPromisesToSyncUp
        // await Promise.allSettled(
        //     mapPromisesToSyncUp(1, routes, ([syncAfterAggregatorSwap], route: ZapInRoute, id: number) =>
        //         route.preview(() => syncAfterAggregatorSwap(id))
        //     )
        // );
        return this.findBestGenericRoute(routes);
    }

    private async tryZapInRouteWithBulkSeller<
        ZapInRoute extends BaseZapInRoute<MetaMethodType, BaseZapInRouteData, ZapInRoute>
    >(route: ZapInRoute): Promise<ZapInRoute | undefined> {
        const bulkLimit = this.getBulkLimit();
        if (bulkLimit.eq(BaseRouter.BULK_SELLER_NO_LIMIT)) {
            return route.routeWithBulkSeller();
        }

        try {
            const tradeValueInEth = await route.estimateSourceTokenAmountInEth();
            const isBelowLimit = tradeValueInEth.lt(bulkLimit);
            const shouldRouteThroughBulkSeller = isBelowLimit;
            if (shouldRouteThroughBulkSeller) {
                // TODO implicitly specify to clone the route with more cache info.
                // Right now the aggregatorResult is copied from route. The above
                // already get the aggregator result and cached, so there should be
                // no problem. In the future, we might want to directly specify
                // that we want to get some info first before cloning.
                return route.routeWithBulkSeller();
            }
        } catch {
            return undefined;
        }
    }

    override async findBestZapOutRoute<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(routes: ZapOutRoute[]): Promise<ZapOutRoute> {
        const routesWithBulkSeller = await Promise.all(
            routes.map(async (route) => {
                try {
                    if (!(await route.hasBulkSeller())) return [];
                    const routeWithBulkSeller = await this.tryZapOutRouteWithBulkSeller(route);
                    return routeWithBulkSeller == undefined ? [] : [routeWithBulkSeller];
                } catch {
                    return [];
                }
            })
        ).then((result) => result.flat());
        routes = [...routes, ...routesWithBulkSeller];
        return this.findBestGenericRoute(routes);
    }

    private async tryZapOutRouteWithBulkSeller<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(route: ZapOutRoute): Promise<ZapOutRoute | undefined> {
        const bulkLimit = this.getBulkLimit();
        if (bulkLimit.eq(BaseRouter.BULK_SELLER_NO_LIMIT)) {
            return route.routeWithBulkSeller();
        }
        try {
            const tradeValueInEth = await route.estimateMaxOutAmongAllRouteInEth();
            if (tradeValueInEth == undefined) return;
            const isBelowLimit = tradeValueInEth.lt(bulkLimit);
            const shouldRouteThroughBulkSeller = isBelowLimit;
            if (shouldRouteThroughBulkSeller) {
                // TODO implicitly specify to clone the route with more cache info.
                // Right now the aggregatorResult is copied from route. The above
                // already get the aggregator result and cached, so there should be
                // no problem. In the future, we might want to directly specify
                // that we want to get some info first before cloning.
                return route.routeWithBulkSeller();
            }
        } catch {
            return undefined;
        }
    }

    override async findBestLiquidityMigrationRoute<
        LiquidityMigrationRoute extends BaseLiquidityMigrationFixTokenRedeemSyRoute<any, LiquidityMigrationRoute, any>
    >(routes: LiquidityMigrationRoute[]): Promise<LiquidityMigrationRoute> {
        if (routes.length === 0) {
            throw new PendleSdkError('Unexpected empty routes');
        }
        // Determine if we should use remove liquidity route with bulkseller.
        // Note that all route should have the same removeLiquidityRoute
        const optimalRemoveLiquidityRoute = await this.findBestZapOutRoute([routes[0].removeLiquidityRoute]);
        routes = routes.map((route) => route.withRemoveLiquidityRoute(optimalRemoveLiquidityRoute));

        const routesWithBulkSellerForAddLiq = await Promise.all(
            routes.map(async (route) => {
                try {
                    if (!(await route.addLiquidityHasBulkSeller())) return [];
                    return [route.addLiquidityRouteWithBulkSeller()];
                } catch {
                    return [];
                }
            })
        ).then((res) => res.flat());

        routes = [...routes, ...routesWithBulkSellerForAddLiq];
        return this.findBestGenericRoute(routes);
    }

    async findBestGenericRoute<Route extends BaseRoute<any, Route>>(routes: Route[]): Promise<Route> {
        const routesData = routes.map(async (route) => {
            const [netOut, netOutInEth] = await Promise.all([route.getNetOut(), route.estimateActualReceivedInEth()]);
            if (!netOut) {
                throw new PendleSdkError('Unable to estimate output');
            }
            if (this.checkErrorOnSimulation) {
                await this.checkSimulableRoute(route);
            }
            return { route, netOut, netOutInEth };
        });

        const [results, errors] = await promiseAllWithErrors(routesData);

        // consideration: maybe also gather the errors and put to the result.
        if (results.length === 0) {
            throw new RoutingError(Array.from(zip(routes, errors), ([route, error]) => ({ route, error })));
        }
        const routesWithNetOutInEth = results.filter((route) => route.netOutInEth != undefined);

        type Item = (typeof results)[number];
        const reducer: (a: Item, b: Item) => Item =
            routesWithNetOutInEth.length === results.length
                ? (a, b) => (a.netOutInEth!.gt(b.netOutInEth!) ? a : b)
                : (a, b) => (a.netOut.gt(b.netOut) ? a : b);
        return results.reduce(reducer).route;
    }

    private async checkSimulableRoute<Route extends BaseRoute<any, Route>>(route: Route): Promise<void> {
        try {
            await route.getGasUsedUnwrapped();
        } catch (e: any) {
            if (e instanceof GasEstimationError && (await route.signerHasApproved())) {
                throw e;
            }
        }
    }
}
