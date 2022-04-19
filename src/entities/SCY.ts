import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { Address, NetworkConnection, TokenAmount } from './types';
import { BigNumberish, Contract, Overrides, ContractTransaction, BigNumber as BN } from 'ethers';
import { dummyABI } from '../dummy';
import { calcSlippedDownAmount, getRouterStatic } from './helper';
export type UserSCYInfo = {
    balance: BN;
    rewards: TokenAmount[];
};

export class SCY {
    public address: Address;
    public contract: Contract; // To-Be replaced by typechain class
    public chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider);
        this.routerStatic = getRouterStatic(_networkConnection.provider, _chainId);
    }

    /**
     * Allow the users to specify slippage instead of Min amount
     *
     * How it works?
     *
     * We will simulate how much SCY user can get out of his base assets, and apply (1 - slippage) to the simulated amount as minAmount
     * */
    public async mint(
        recipient: Address,
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const amountScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mint(recipient, baseAssetIn, amountBaseToPull, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .mint(recipient, baseAssetIn, amountBaseToPull, calcSlippedDownAmount(amountScyOut, slippage), overrides);
    }

    /**
     * Similar to mint, we allow the user to pass in slippage instead
     */
    public async redeem(
        recipient: Address,
        baseAssetOut: Address,
        amountScyToPull: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const amountBaseOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeem(recipient, baseAssetOut, amountScyToPull, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeem(
                recipient,
                baseAssetOut,
                amountScyToPull,
                calcSlippedDownAmount(amountBaseOut, slippage),
                overrides
            );
    }

    public async userInfo(user: Address): Promise<UserSCYInfo> {
        return (await this.routerStatic.callStatic.getUserSCYInfo(this.address, user)) as UserSCYInfo;
    }

    // Add additional functions below
}
