import type { PendleYieldToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount } from './types';
import { type BigNumber as BN, Contract } from 'ethers';
import { getRouterStatic } from './helper';
import { dummyABI } from '../dummy';

export type UserYOInfo = {
    yt: Address;
    ytBalance: BN;
    ot: Address;
    otBalance: BN;
    unclaimedInterest: TokenAmount;
    unclaimedRewards: TokenAmount[];
};

export type YOInfo = {
    exchangeRate: BN;
    totalSupply: BN;
    rewardIndexes: RewardIndex[];
};

export type RewardIndex = {
    rewardToken: Address;
    index: BN;
};

export class YT {
    public address: Address;
    public contract: PendleYieldToken;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleYieldToken;
        this.routerStatic = getRouterStatic(_networkConnection.provider, _chainId);
    }

    async userInfo(user: Address): Promise<UserYOInfo> {
        return this.routerStatic.callStatic.getUserYOInfo(this.address, user);
    }

    async getInfo(): Promise<YOInfo> {
        const [exchangeRate, totalSupply, rewardIndexes] = await this.routerStatic.callStatic.getYOInfo(this.address);
        return { exchangeRate, totalSupply, rewardIndexes };
    }
}
