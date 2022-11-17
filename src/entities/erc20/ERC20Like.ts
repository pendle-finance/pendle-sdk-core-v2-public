import { Address, BN, BigNumberish, TransactionResponse } from '../../common';

export interface ERC20Like {
    readonly address: Address;
    name(): Promise<string>;
    symbol(): Promise<string>;
    decimals(): Promise<number>;
    balanceOf(userAddress: Address): Promise<BN>;
    allowance(owner: Address, spender: Address): Promise<BN>;
    approve(spender: Address, amount: BN): Promise<TransactionResponse | undefined>;
    transfer(to: Address, amount: BigNumberish): Promise<TransactionResponse>;
}
