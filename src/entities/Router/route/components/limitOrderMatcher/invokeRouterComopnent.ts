import * as routeHelper from '../../helper';
import { BaseRouter } from '../../../BaseRouter';
import * as limitOrder from '../../../limitOrder';

export function createWithRouterComponent<MatchingMethod extends keyof limitOrder.LimitOrderMatcher>(
    router: BaseRouter,
    method: MatchingMethod,
    params: Parameters<limitOrder.LimitOrderMatcher[MatchingMethod]>
) {
    const name = [
        'LimitOrderMatcher',
        'withRouterComponent',
        method,
        params[0],
        params[1],
        params[2].routerMethod,
    ].join('.');
    return routeHelper.createMinimalRouteComponent(name, [], async () => {
        const lo = router.limitOrderMatcher;
        return Reflect.apply(lo[method], lo, params) as Promise<limitOrder.LimitOrderMatchedResult>;
    });
}
