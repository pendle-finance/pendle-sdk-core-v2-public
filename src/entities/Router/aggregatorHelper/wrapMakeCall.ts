import { AsyncOrSync } from 'ts-essentials';
import { ChainId, isNativeToken, areSameAddresses, NATIVE_ADDRESS_0xEE } from '../../../common';
import { AggregatorResult, MakeCallParams, createNoneAggregatorResult } from './AggregatorHelper';
import { patchETH_wETH } from './patchETH_WETH';

/**
 * Transform the params and handle trivial cases before calling the main logic.
 *
 * @privateRemarks
 * This function is created to prefer composition over inheritance.
 *
 * @param context
 * @param params
 * @param callback
 */
export async function wrapMakeCall(
    context: { chainId: ChainId },
    [{ token: tokenIn, amount: amountIn }, tokenOut, slippage, params]: MakeCallParams,
    callback: (...params: MakeCallParams) => AsyncOrSync<AggregatorResult>
): Promise<AggregatorResult> {
    // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
    if (isNativeToken(tokenIn)) tokenIn = NATIVE_ADDRESS_0xEE;
    if (isNativeToken(tokenOut)) tokenOut = NATIVE_ADDRESS_0xEE;

    if (areSameAddresses(tokenIn, tokenOut)) {
        return createNoneAggregatorResult(amountIn);
    }

    const patchETH_wETHResult = patchETH_wETH(context, { token: tokenIn, amount: amountIn }, tokenOut);
    if (patchETH_wETHResult) return patchETH_wETHResult;
    return callback({ token: tokenIn, amount: amountIn }, tokenOut, slippage, params);
}
