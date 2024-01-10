import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as routerTypes from '../../../types';
import { BaseRouter } from '../../../BaseRouter';

export type TokenInputStructBuilder = Route.Component<'aggregatorResultGetter', routerTypes.TokenInput>;

export function createTokenInputStructBuilder(
    router: BaseRouter,
    params?: { needScale?: boolean }
): TokenInputStructBuilder {
    const { needScale = false } = params ?? {};
    return routeHelper.createMinimalRouteComponent(
        'tokenInputStructBuilder',
        ['aggregatorResultGetter'],
        async (route) => {
            const [aggregatorResult, inputTokenAmount, outputToken] = await Promise.all([
                Route.getAggregatorResult(route),
                route.aggregatorResultGetter.getInput(route),
                route.aggregatorResultGetter.getOutputTokenAddress(route),
            ]);
            const swapData = aggregatorResult.createSwapData({ needScale });
            const pendleSwap = router.getPendleSwapAddress(swapData.swapType);
            const input: routerTypes.TokenInput = {
                tokenIn: inputTokenAmount.token,
                netTokenIn: inputTokenAmount.amount,
                tokenMintSy: outputToken,
                pendleSwap,
                swapData,
            };
            return input;
        }
    );
}
