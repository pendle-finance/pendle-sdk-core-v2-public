import type { PendlePrincipalToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import type { UserPyInfo, PyInfo } from './YtEntity';
import { abi as PendlePrincipalTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendlePrincipalToken.sol/PendlePrincipalToken.json';
import { ContractInterface } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';
import { YtEntity } from './YtEntity';
import { ScyEntity } from './ScyEntity';

export class PtEntity extends ERC20 {
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = PendlePrincipalTokenABI
    ) {
        super(address, networkConnection, chainId, abi);
        this.routerStatic = getRouterStatic(networkConnection, chainId);
    }

    get pendlePrincipalTokenContract() {
        return this.contract as PendlePrincipalToken;
    }

    get ptContract() {
        return this.pendlePrincipalTokenContract;
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserPyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(multicall?: Multicall): Promise<PyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getPYInfo(this.address);
    }

    async SCY(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.ptContract, multicall).callStatic.SCY();
    }

    /**
     * Alias for PT#SCY
     * @see PtEntity#SCY
     */
    async scy(multicall?: Multicall) {
        return this.SCY(multicall);
    }

    async YT(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.ptContract, multicall).callStatic.YT();
    }

    /**
     * Alias for PT#YT
     * @see PtEntity#YT
     */
    async yt(multicall?: Multicall) {
        return this.YT(multicall);
    }

    async scyEntity(multicall?: Multicall) {
        const scyAddr = await this.SCY(multicall);
        return new ScyEntity(scyAddr, this.networkConnection, this.chainId);
    }

    async ytEntity(multicall?: Multicall) {
        const ytAddr = await this.YT(multicall);
        return new YtEntity(ytAddr, this.networkConnection, this.chainId);
    }
}
