import { Route } from '../../route';
import * as routeMod from '../../route';
import { BaseRouter } from '../../BaseRouter';

export type LimitOrderRouteSelectorResult<R extends Route.PartialRoute<'limitOrderMatcher' | 'netOutGetter'>> =
    | {
          verdict: 'ROUTE_WITH_LIMIT_ORDER_SELECTED';
          selectedRoute: R;
          allRoutes: R[];
      }
    | {
          verdict: 'ROUTE_WITHOUT_LIMIT_ORDER_SELECTED';
          reason: 'MATCHING_FAILED' | 'CORRUPTED_LIMIT_ORDERS' | 'SUBOPTIMAL_RESULT';
          selectedRoute: R;
          allRoutes: R[];
      }
    | { verdict: 'FAILED'; allRoutes: R[] };

export type LimitOrderRouteSelector = <R extends Route.PartialRoute<'limitOrderMatcher' | 'netOutGetter'>>(
    router: BaseRouter,
    route: R
) => Promise<LimitOrderRouteSelectorResult<R>>;

export const limitOrderRouteSelectorWithFallback: LimitOrderRouteSelector = async (_router, routeWithLimitOrder) => {
    const routeNoLimitOrder = {
        ...routeWithLimitOrder,
        limitOrderMatcher: routeMod.limitOrderMatcher.createEmpty(),
    };
    const allRoutes = [routeWithLimitOrder, routeNoLimitOrder];
    const [withLimitOrderNetOut, noLimitOrderNetOut] = await Promise.allSettled([
        Route.getNetOut(routeWithLimitOrder),
        Route.getNetOut(routeNoLimitOrder),
    ]);
    if (noLimitOrderNetOut.status === 'rejected') {
        return { verdict: 'FAILED', allRoutes };
    }
    if (withLimitOrderNetOut.status === 'rejected') {
        const [limitOrderMatchingResult] = await Promise.allSettled([
            Route.getMatchedLimitOrderResult(routeWithLimitOrder),
        ]);
        const isFailedAtLOMatching = limitOrderMatchingResult.status === 'rejected';
        return {
            verdict: 'ROUTE_WITHOUT_LIMIT_ORDER_SELECTED',
            reason: isFailedAtLOMatching ? 'MATCHING_FAILED' : 'CORRUPTED_LIMIT_ORDERS',
            selectedRoute: routeNoLimitOrder,
            allRoutes,
        };
    }
    // Note on  the case equals: we still prioritize
    if (withLimitOrderNetOut.value.gte(noLimitOrderNetOut.value)) {
        return { verdict: 'ROUTE_WITH_LIMIT_ORDER_SELECTED', selectedRoute: routeWithLimitOrder, allRoutes };
    }
    return {
        verdict: 'ROUTE_WITHOUT_LIMIT_ORDER_SELECTED',
        reason: 'SUBOPTIMAL_RESULT',
        selectedRoute: routeNoLimitOrder,
        allRoutes,
    };
};
