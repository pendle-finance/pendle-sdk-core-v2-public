import { RawTokenAmount, Address, isNativeToken, NATIVE_ADDRESS_0xEE, areSameAddresses } from '../../../common';
import { BigNumberish } from 'ethers';
import { AggregatorHelper, AggregatorResult, createNoneAggregatorResult } from './AggregatorHelper';

export class VoidAggregatorHelper implements AggregatorHelper {
    makeCall(
        { token: tokenIn, amount }: RawTokenAmount<BigNumberish>,
        tokenOut: Address
    ): AggregatorResult | undefined {
        if (isNativeToken(tokenIn)) tokenIn = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(tokenOut)) tokenOut = NATIVE_ADDRESS_0xEE;

        if (areSameAddresses(tokenIn, tokenOut)) {
            return createNoneAggregatorResult(amount);
        }
        return undefined;
    }
}
