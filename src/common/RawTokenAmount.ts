import { Address, toAddress } from './Address';
import { BigNumber as BN, BigNumberish } from 'ethers';

/**
 * Pair of a token address with raw amount.
 *
 * @typeParam AmountType - the type for the amount. `BigNumberish` should be used instead of `BN` for input values.
 */
export type RawTokenAmount<AmountType extends BigNumberish = BN> = {
    token: Address;
    amount: AmountType;
};

/**
 * Create a _type-safe_ `RawTokenAmount` object.
 *
 * @remarks
 * Often used to convert contract return values.
 *
 * @param tokenParam
 * @param tokenParam.token - the raw address. In the result, it will be casted to {@link Address} with {@link toAddress}.
 */
export function createTokenAmount({ token, amount }: { token: string; amount: BigNumberish }): RawTokenAmount {
    return { token: toAddress(token), amount: BN.from(amount) };
}

export function rawTokenAmountToStringTuple({ token, amount }: RawTokenAmount<BigNumberish>) {
    return [token, BN.from(amount).toString()];
}
