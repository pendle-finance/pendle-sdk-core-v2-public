import type { PendlePrincipalToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from '../types';
import type { UserPYInfo, PYInfo } from './YT';
import { abi as PendlePrincipalTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendlePrincipalToken.sol/PendlePrincipalToken.json';
import { Contract } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';

export class PT {
    readonly ERC20: ERC20;
    readonly contract: PendlePrincipalToken;

    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this.contract = new Contract(
            address,
            PendlePrincipalTokenABI,
            networkConnection.provider
        ) as PendlePrincipalToken;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserPYInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(multicall?: Multicall): Promise<PYInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getPYInfo(this.address);
    }

    async YT(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.contract, multicall).callStatic.YT();
    }
}
