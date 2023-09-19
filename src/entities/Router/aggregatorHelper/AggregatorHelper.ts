import { SwapData, SwapType } from '../types';
import { BN, BigNumberish, RawTokenAmount, Address, NATIVE_ADDRESS_0x00, If } from '../../../common';
import { AsyncOrSync } from 'ts-essentials';
import { PendleSdkError } from '../../../errors';

// For easier import
export { SwapData, SwapType } from '../types';

export interface AggregatorResult {
    /**
     * @deprecated This number is not important, so it won't be returned in the subsequential result.
     */
    amountInUsd?: number;

    /**
     * @deprecated This number is not important, so it won't be returned in the subsequential result.
     */
    amountOutUsd?: number;
    outputAmount: BN;

    getSwapType(): SwapType;
    createSwapData(params: { needScale: boolean }): SwapData;
}

export function createNoneAggregatorResult(amount: BigNumberish): AggregatorResult {
    return {
        amountInUsd: undefined,
        amountOutUsd: undefined,
        outputAmount: BN.from(amount),

        getSwapType: () => SwapType.NONE,
        createSwapData: () => ({
            swapType: SwapType.NONE,
            extRouter: NATIVE_ADDRESS_0x00,
            extCalldata: [],
            needScale: false, // aggregator is not used.
        }),
    };
}

export const NONE_AGGREGATOR_RESULT = createNoneAggregatorResult(0);
export type MakeCallParams = [
    tokenAmountIn: RawTokenAmount<BigNumberish>,
    tokenOut: Address,
    slippage: number,
    params?: { aggregatorReceiver?: Address; needScale?: boolean }
];

export interface AggregatorHelper<CheckedResult extends boolean = boolean> {
    makeCall(...params: MakeCallParams): AsyncOrSync<If<CheckedResult, AggregatorResult, AggregatorResult | undefined>>;
}

export class AggregatorHelperError extends PendleSdkError {}

export function forceAggregatorHelperToCheckResult(aggregatorHelper: AggregatorHelper): AggregatorHelper<true> {
    return {
        async makeCall(...params: Parameters<AggregatorHelper['makeCall']>): Promise<AggregatorResult> {
            const res = await aggregatorHelper.makeCall(...params);
            if (res == undefined) throw new AggregatorHelperError('Unexpected undefined result from aggregator.');
            return res;
        },
    };
}
