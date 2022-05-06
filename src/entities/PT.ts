import type { PendlePrincipalToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserPYInfo, PYInfo } from './YT';
import { abi as PendlePrincipalTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/PendlePrincipalToken.sol/PendlePrincipalToken.json';
import { Contract } from 'ethers';
import { getRouterStatic } from './helper';

export class PT {
    address: Address;
    contract: PendlePrincipalToken;
    chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(
            _address,
            PendlePrincipalTokenABI,
            _networkConnection.provider
        ) as PendlePrincipalToken;
        this.routerStatic = getRouterStatic(_networkConnection.provider, _chainId);
    }

    async userInfo(user: Address): Promise<UserPYInfo> {
        return this.routerStatic.callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(): Promise<PYInfo> {
        const [exchangeRate, totalSupply, rewardIndexes] = await this.routerStatic.callStatic.getPYInfo(this.address);
        return { exchangeRate, totalSupply, rewardIndexes };
    }
}
