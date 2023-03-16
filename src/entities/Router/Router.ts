import { MetaMethodType } from '../../contracts';
import { PendleSdkError } from '../../errors';
import { devLog, promiseAllWithErrors } from '../../common';

import {
    BaseRoute,
    BaseZapInRoute,
    BaseZapOutRoute,
    BaseZapInRouteData,
    BaseZapOutRouteIntermediateData,
} from './route';

import { BaseRouter } from './BaseRouter';
import { BaseRouterConfig } from './types';
import { getContractAddresses } from '../../common';
import { KyberSwapAggregatorHelper } from './aggregatorHelper';

export type RouterConfig = BaseRouterConfig;

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
            provider: provider,
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
    >(routes: ZapInRoute[]): Promise<ZapInRoute | undefined> {
        const routesWithBulkSeller = await Promise.all(
            routes.map(async (route) => {
                if (!(await route.hasBulkSeller())) return [];
                const routeWithBulkSeller = await this.tryZapInRouteWithBulkSeller(route);
                return routeWithBulkSeller == undefined ? [] : [routeWithBulkSeller];
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
    }

    override async findBestZapOutRoute<
        ZapOutRoute extends BaseZapOutRoute<MetaMethodType, BaseZapOutRouteIntermediateData, ZapOutRoute>
    >(routes: ZapOutRoute[]): Promise<ZapOutRoute | undefined> {
        const routesWithBulkSeller = await Promise.all(
            routes.map(async (route) => {
                if (!(await route.hasBulkSeller())) return [];
                const routeWithBulkSeller = await this.tryZapOutRouteWithBulkSeller(route);
                return routeWithBulkSeller == undefined ? [] : [routeWithBulkSeller];
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

        const tradeValueInEth = await route.estimateMaxOutAmoungAllRouteInEth();
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
    }

    async findBestGenericRoute<Route extends BaseRoute<any, Route>>(routes: Route[]): Promise<Route | undefined> {
        const routesData = routes.map(async (route) => {
            try {
                const netOutInEth = await route.estimateActualReceivedInEth();
                return netOutInEth ? [{ route, netOutInEth }] : [];
            } catch (e: any) {
                devLog('Router params error: ', e);
                if (e instanceof PendleSdkError) {
                    throw e;
                }
                return [];
            }
        });

        const [results, errors] = await promiseAllWithErrors(routesData);
        const flattenResults = results.flat();
        if (flattenResults.length === 0) {
            if (errors.length > 0) {
                throw errors[0];
            }
            return undefined;
        }
        return flattenResults.reduce((a, b) => (a.netOutInEth.gt(b.netOutInEth) ? a : b)).route;
    }
}
