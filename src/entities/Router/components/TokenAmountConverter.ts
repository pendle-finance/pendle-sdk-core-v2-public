import { BaseRouter } from '../BaseRouter';
import * as common from '../../../common';

export type TokenAmountConverter = (
    router: BaseRouter,
    input: common.RawTokenAmount,
    outputToken: common.Address
) => Promise<common.BN>;

export const tokenAmountConverterViaAggregatorHelper: TokenAmountConverter = async (router, input, outputToken) => {
    const dummySlippage = 2 / 100;
    const res = await router.aggregatorHelper.makeCall(input, outputToken, dummySlippage);
    return res.outputAmount;
};
