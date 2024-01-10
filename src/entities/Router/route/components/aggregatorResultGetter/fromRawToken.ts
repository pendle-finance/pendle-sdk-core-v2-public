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
    const description = [
        'AggregatorResultGetter.fromRawToken',
        common.rawTokenAmountToStringTuple(rawTokenInput),
        tokenMintSy,
    ];
    return routeHelper.addCacheForComponent({
        call: async () => {
            return router.aggregatorHelper.makeCall(rawTokenInput, tokenMintSy, slippage, {
                aggregatorReceiver,
                needScale,
            });
        },
        description: () => Promise.resolve(description),
        getInput: () => Promise.resolve(rawTokenInput),
        getOutputTokenAddress: () => Promise.resolve(tokenMintSy),
    });
}
