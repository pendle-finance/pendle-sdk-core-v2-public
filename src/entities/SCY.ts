import { Address, NetworkConnection, TokenAmount } from './types';
import { Contract, Overrides, ContractTransaction, BigNumber as BN } from 'ethers';
import { dummyABI } from '../dummy';

export type UserSCYInfo = {
    balance: BN;
    rewards: TokenAmount[];
};

export class SCY {
    public address: Address;
    public contract: Contract; // To-Be replaced by typechain class
    public chainId: number;

    protected networkConnection: NetworkConnection;
    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider);
    }

    /**
     * Allow the users to specify slippage instead of Min amount
     *
     * How it works?
     *
     * We will simulate how much SCY user can get out of his base assets, and apply (1 - slippage) to the simulated amount as minAmount
     * */
    public async pullAndMint(
        receipient: Address,
        baseAssetIn: Address,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    /**
     * Similar to mint, we allow the user to pass in slippage instead
     */
    public async pullAndRedeem(
        receipient: Address,
        baseAssetOut: Address,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    public async userInfo(user: Address): Promise<UserSCYInfo> {
        return {} as UserSCYInfo;
    }

    // Add additional functions below
}
