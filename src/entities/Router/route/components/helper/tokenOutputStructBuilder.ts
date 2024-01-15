import * as Route from '../../Route';
import * as routeHelper from '../../helper';
import * as routerTypes from '../../../types';
import * as common from '../../../../../common';
import { BaseRouter } from '../../../BaseRouter';

export type TokenOutputStructBuilder = Route.Component<'aggregatorResultGetter', routerTypes.TokenOutput>;

export function createTokenOutputStructBuilder(
    router: BaseRouter,
    params: { slippage: number; needScale?: boolean }
): TokenOutputStructBuilder {
    const { needScale = true, slippage } = params;
    return routeHelper.createMinimalRouteComponent(
        router,
        'tokenOutputStructBuilder',
        ['aggregatorResultGetter'],
        async (route) => {
            const [aggregatorResult, inputTokenAmount, outputToken] = await Promise.all([
                Route.getAggregatorResult(route),
                route.aggregatorResultGetter.getInput(route),
                route.aggregatorResultGetter.getOutputTokenAddress(route),
            ]);
            const swapData = aggregatorResult.createSwapData({ needScale });
            const pendleSwap = router.getPendleSwapAddress(swapData.swapType);
            const output: routerTypes.TokenOutput = {
                tokenOut: outputToken,
                tokenRedeemSy: inputTokenAmount.token,
                minTokenOut: common.calcSlippedDownAmount(aggregatorResult.outputAmount, slippage),
                pendleSwap,
                swapData,
            };
            return output;
        }
    );
}
