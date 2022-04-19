import type { PendleOwnershipToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserYOInfo, YOInfo } from './YT';
import { Contract } from 'ethers';
import { getRouterStatic } from './helper';
import { dummyABI } from '../dummy';

export class OT {
    public address: Address;
    public contract: PendleOwnershipToken;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleOwnershipToken;
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
