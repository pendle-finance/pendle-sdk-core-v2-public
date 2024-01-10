import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as limitOrder from '../../../limitOrder';

export function createEmpty(): Route.LimitOrderMatcher {
    return routeHelper.createMinimalRouteComponent(
        'LimitOrderMatcher.empty',
        [],
        async () => limitOrder.LimitOrderMatchedResult.EMPTY
    );
}
