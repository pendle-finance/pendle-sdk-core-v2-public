import { SwapData, SwapType } from '../types';
import { BN, BigNumberish, RawTokenAmount, Address, NATIVE_ADDRESS_0x00, If } from '../../../common';
import { AsyncOrSync } from 'ts-essentials';
import { PendleSdkError } from '../../../errors';

// For easier import
export { SwapData, SwapType } from '../types';

export interface AggregatorResult {
    amountInUsd?: number;
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

export function createETH_WETHAggregatorResult(amount: BigNumberish): AggregatorResult {
    return {
        amountInUsd: undefined,
        amountOutUsd: undefined,
        outputAmount: BN.from(amount),
        getSwapType: () => SwapType.ETH_WETH,

        createSwapData: ({ needScale }: { needScale: boolean }) => ({
            swapType: SwapType.ETH_WETH,
            extRouter: NATIVE_ADDRESS_0x00,
            extCalldata: [],
            needScale,
        }),
    };
}

export const NONE_AGGREGATOR_RESULT = createNoneAggregatorResult(0);

export interface AggregatorHelper<CheckedResult extends boolean = boolean> {
    makeCall(
        tokenAmountIn: RawTokenAmount<BigNumberish>,
        tokenOut: Address,
        slippage: number,
        params?: { aggregatorReceiver?: Address }
    ): AsyncOrSync<If<CheckedResult, AggregatorResult, AggregatorResult | undefined>>;
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
