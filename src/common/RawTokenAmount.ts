import { Address, toAddress } from './Address';
import { BigNumber as BN, BigNumberish } from 'ethers';

export type RawTokenAmount<AmountType extends BigNumberish = BN> = {
    token: Address;
    amount: AmountType;
};

export function createTokenAmount({ token, amount }: { token: string; amount: BigNumberish }): RawTokenAmount {
    return { token: toAddress(token), amount: BN.from(amount) };
}
