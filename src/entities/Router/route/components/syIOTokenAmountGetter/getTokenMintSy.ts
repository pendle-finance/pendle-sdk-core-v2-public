import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import { BaseRouter } from '../../../BaseRouter';

export function createTokenMintSyGetter(router: BaseRouter): Route.SYIOTokenAmountGetter<'aggregatorResultGetter'> {
    return routeHelper.createMinimalRouteComponent(
        router,
        'SYIOTokenAmountGetter.getTokenMintSy',
        ['aggregatorResultGetter'],
        async (route) => {
            const [aggegatorResult, outputToken] = await Promise.all([
                Route.getAggregatorResult(route),
                route.aggregatorResultGetter.getOutputTokenAddress(route),
            ]);
            return { token: outputToken, amount: aggegatorResult.outputAmount };
        }
    );
}
