import * as Route from '../../Route';
import * as common from '../../../../../common';
import * as routeHelper from '../../helper';
import { BaseRouter } from '../../../BaseRouter';

export function createToRawToken(
    router: BaseRouter,
    rawToken: common.Address,
    slippage: number,
    params?: {
        needScale?: boolean;
        aggregatorReceiver?: common.Address;
    }
): Route.AggregatorResultGetter<'syIOTokenAmountGetter'> {
    const { needScale = true, aggregatorReceiver } = params ?? {};
    return routeHelper.addCacheForComponent({
        call: async (route) => {
            const tokenRedeemSyAmount = await Route.getSYIOTokenAmount(route);
            return router.aggregatorHelper.makeCall(tokenRedeemSyAmount, rawToken, slippage, {
                aggregatorReceiver,
                needScale,
            });
        },
        description: async (route) => [
            'AggregatorResultGetter',
            'toRawToken',
            'syIOTokenAmountGetter',
            await route.syIOTokenAmountGetter.description(route),
        ],
        getInput: (route) => Route.getSYIOTokenAmount(route),
        getOutputTokenAddress: () => Promise.resolve(rawToken),
    });
}
