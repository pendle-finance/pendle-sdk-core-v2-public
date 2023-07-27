import {
    ChainId,
    RawTokenAmount,
    BigNumberish,
    BN,
    Address,
    isNativeToken,
    areSameAddresses,
    getContractAddresses,
    NATIVE_ADDRESS_0x00,
} from '../../../common';
import { AggregatorResult, SwapType } from './AggregatorHelper';

export function patchETH_wETH(
    context: { chainId: ChainId },
    { token: tokenIn, amount }: RawTokenAmount<BigNumberish>,
    tokenOut: Address
): AggregatorResult | undefined {
    const wrappedNative = getContractAddresses(context.chainId).WRAPPED_NATIVE;
    for (const [tokenA, tokenB] of [
        [tokenIn, tokenOut],
        [tokenOut, tokenIn],
    ]) {
        if (isNativeToken(tokenA) && areSameAddresses(tokenB, wrappedNative)) {
            return createETH_WETHAggregatorResult(amount);
        }
    }
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
