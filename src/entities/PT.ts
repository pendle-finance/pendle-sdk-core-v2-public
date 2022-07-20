import type { PendlePrincipalToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserPYInfo, PYInfo } from './YT';
import { abi as PendlePrincipalTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendlePrincipalToken.sol/PendlePrincipalToken.json';
import { Contract } from 'ethers';
import { getRouterStatic } from './helper';

export class PT {
    readonly contract: PendlePrincipalToken;

    protected readonly routerStatic: RouterStatic;

    constructor(readonly address: Address, protected readonly networkConnection: NetworkConnection, readonly chainId: number) {
        this.contract = new Contract(
            address,
            PendlePrincipalTokenABI,
            networkConnection.provider
        ) as PendlePrincipalToken;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async userInfo(user: Address): Promise<UserPYInfo> {
        return this.routerStatic.callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(): Promise<PYInfo> {
        const [exchangeRate, totalSupply, rewardIndexes] = await this.routerStatic.callStatic.getPYInfo(this.address);
        return { exchangeRate, totalSupply, rewardIndexes };
    }
}
