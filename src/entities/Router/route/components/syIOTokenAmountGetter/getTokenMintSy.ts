import * as Route from '../../Route';
import * as routeHelper from '../../helper';

export function createTokenMintSyGetter(): Route.SYIOTokenAmountGetter<'aggregatorResultGetter'> {
    return routeHelper.createMinimalRouteComponent(
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
