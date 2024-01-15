import * as routeHelper from '../../helper';
import { BaseRouter } from '../../../BaseRouter';
import * as limitOrder from '../../../limitOrder';
import * as common from '../../../../../common';

export function createWithRouterComponent<MatchingMethod extends keyof limitOrder.LimitOrderMatcher>(
    router: BaseRouter,
    method: MatchingMethod,
    params: Parameters<limitOrder.LimitOrderMatcher[MatchingMethod]>
) {
    const name = common.LazyDeferrable.create(async () =>
        [
            'LimitOrderMatcher',
            'withRouterComponent',
            method,
            params[0],
            await common.unwrapDeferrable(params[1]),
            params[2].routerMethod,
        ].join('.')
    );
    return routeHelper.createMinimalRouteComponent(router, name, [], async () => {
        const lo = router.limitOrderMatcher;
        return Reflect.apply(lo[method], lo, params) as Promise<limitOrder.LimitOrderMatchedResult>;
    });
}
