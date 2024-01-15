import * as Route from '../../Route';
import * as common from '../../../../../common';
import * as routeHelper from '../../helper';
import { BaseRouter } from '../../../BaseRouter';

export function createFromRawToken(
    router: BaseRouter,
    rawTokenInput: common.RawTokenAmount,
    tokenMintSy: common.Address,
    slippage: number,
    params?: {
        needScale?: boolean;
        aggregatorReceiver?: common.Address;
    }
): Route.AggregatorResultGetter {
    const { needScale = false, aggregatorReceiver } = params ?? {};
    const name = [
        'AggregatorResultGetter.fromRawToken',
        common.rawTokenAmountToString(rawTokenInput),
        tokenMintSy,
    ].join('.');
    const debugInfo = {
        rawTokenInput,
        tokenMintSy,
        slippage,
    };
    return routeHelper.applyRouteComponentTrait({
        router,
        name,
        dependencies: [],
        debugInfo,

        call: async () => {
            return router.aggregatorHelper.makeCall(rawTokenInput, tokenMintSy, slippage, {
                aggregatorReceiver,
                needScale,
            });
        },
        description: () => Promise.resolve(name),
        getInput: () => Promise.resolve(rawTokenInput),
        getOutputTokenAddress: () => Promise.resolve(tokenMintSy),
    });
}
