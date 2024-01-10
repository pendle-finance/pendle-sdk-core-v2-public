import { Route } from '../../route';
import { BaseRouter } from '../../BaseRouter';
import * as iters from 'itertools';
import { Simplify } from 'type-fest';

type RequiredRoute = Route.PartialRoute<'gasUsedEstimator' | 'netOutGetter' | 'netOutInNativeEstimator'>;

type SharedResult<R extends RequiredRoute> = {
    allRoutes: R[];
    routeStatuses: {
        status: 'SUCCESS' | 'FAILED';
        // the actual Error is not included here, since it can be obtained
        // right from the route by invoking the corresponding component.
    }[];
};

export type OptimalOutputRouteSelectionResult<R extends RequiredRoute> =
    | Simplify<
          SharedResult<R> & {
              verdict: 'SUCCESS';
              selectedRoute: R;
          }
      >
    | Simplify<
          SharedResult<R> & {
              verdict: 'FAILED';
          }
      >;

export type OptimalOutputRouteSelector = <R extends RequiredRoute>(
    router: BaseRouter,
    routes: R[]
) => Promise<OptimalOutputRouteSelectionResult<R>>;

export const optimalOutputRouteSelectorNetOutOnly: OptimalOutputRouteSelector = async (_router, allRoutes) => {
    const netOutWithStatus = await Promise.allSettled(iters.map(allRoutes, Route.getNetOut));
    const routeStatuses = iters.map(
        netOutWithStatus,
        ({ status }) =>
            ({
                status: status === 'fulfilled' ? 'SUCCESS' : 'FAILED',
            }) as const
    );

    const fullfiledRoutes = iters.flatmap(iters.izip(allRoutes, netOutWithStatus), ([route, res]) => {
        if (res.status === 'rejected') return [];
        return [{ route, value: res.value }] as const;
    });
    const selectedRoute = iters.reduce(fullfiledRoutes, (u, v) => (u.value.gt(v.value) ? u : v))?.route;
    if (selectedRoute === undefined) {
        return {
            verdict: 'FAILED',
            routeStatuses,
            allRoutes,
        };
    }
    return {
        verdict: 'SUCCESS',
        selectedRoute,
        routeStatuses,
        allRoutes,
    };
};

export const optimalOutputRouteSelectorWithGasAccounted: OptimalOutputRouteSelector = async (router, allRoutes) => {
    // all of the following promises will be in parallel
    const netOutInNativeWithStatusPromises = Promise.allSettled(iters.imap(allRoutes, Route.estimateNetOutInNative));
    const gasUsedWithStatusPromises = Promise.allSettled(iters.imap(allRoutes, Route.estimateGasUsed));
    const gasFeePromise = router.gasFeeEstimator.getGasFee();

    const netOutInNativeWithStatus = await netOutInNativeWithStatusPromises;
    const hasRouteWithoutEstimatedOutput = iters.some(netOutInNativeWithStatus, ({ status }) => status === 'rejected');
    if (hasRouteWithoutEstimatedOutput) {
        // fallback to just use the output
        return optimalOutputRouteSelectorNetOutOnly(router, allRoutes);
    }

    const gasFee = await gasFeePromise;

    const gasUsedWithStatus = await gasUsedWithStatusPromises;
    const estimatedNativeReceivedAmounts = iters.map(
        iters.izip(netOutInNativeWithStatus, gasUsedWithStatus),
        ([netOut, gasUsed]) => {
            if (netOut.status === 'rejected' || gasUsed.status === 'rejected') return undefined;
            return netOut.value.sub(gasUsed.value.mul(gasFee));
        }
    );

    const routeStatuses = iters.map(
        estimatedNativeReceivedAmounts,
        (item) =>
            ({
                status: item === undefined ? 'FAILED' : 'SUCCESS',
            }) as const
    );
    const routesWithActualReceivedInNative = iters
        .zip(allRoutes, estimatedNativeReceivedAmounts)
        .flatMap(([route, amount]) => (amount === undefined ? [] : ([{ route, amount }] as const)));

    const selectedRoute = iters.reduce(routesWithActualReceivedInNative, (u, v) => (u.amount.gt(v.amount) ? u : v))
        ?.route;

    if (selectedRoute === undefined) {
        return {
            verdict: 'FAILED',
            routeStatuses,
            allRoutes,
        };
    }
    return {
        verdict: 'SUCCESS',
        selectedRoute,
        routeStatuses,
        allRoutes,
    };
};
