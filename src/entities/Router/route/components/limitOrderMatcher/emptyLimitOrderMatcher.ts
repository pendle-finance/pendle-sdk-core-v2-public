import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as limitOrder from '../../../limitOrder';
import { BaseRouter } from '../../../BaseRouter';

export function createEmpty(router: BaseRouter): Route.LimitOrderMatcher {
    return routeHelper.createMinimalRouteComponent(
        router,
        'LimitOrderMatcher.empty',
        [],
        async () => limitOrder.LimitOrderMatchedResult.EMPTY
    );
}
