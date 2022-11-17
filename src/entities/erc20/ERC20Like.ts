import { Address, BN, BigNumberish, TransactionResponse } from '../../common';

/**
 * A subset of {@link https://eips.ethereum.org/EIPS/eip-20 | ERC20}
 */
export interface ERC20Like {
    readonly address: Address;
    name(): Promise<string>;
    symbol(): Promise<string>;
    decimals(): Promise<number>;
    balanceOf(userAddress: Address): Promise<BN>;
    allowance(owner: Address, spender: Address): Promise<BN>;

    /**
     * @returns
     * - `undefined` is returned when no actual transaction are made, in case of {@link NativeERC20}.
     * @see NativeERC20
     */
    approve(spender: Address, amount: BN): Promise<TransactionResponse | undefined>;
    transfer(to: Address, amount: BigNumberish): Promise<TransactionResponse>;
}
