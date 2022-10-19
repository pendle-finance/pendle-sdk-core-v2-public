import type { PendlePrincipalToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import type { UserPyInfo, PyInfo } from './YtEntity';
import { abi as PendlePrincipalTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendlePrincipalToken.sol/PendlePrincipalToken.json';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { YtEntity } from './YtEntity';
import { ScyEntity } from './ScyEntity';
import { WrappedContract } from '../contractHelper';

export type PtEntityConfig = ERC20Config;

export class PtEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: PtEntityConfig
    ) {
        super(address, networkConnection, chainId, { abi: PendlePrincipalTokenABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    get pendlePrincipalTokenContract() {
        return this.contract as WrappedContract<PendlePrincipalToken>;
    }

    get ptContract() {
        return this.pendlePrincipalTokenContract;
    }

    async userInfo(user: Address, multicall = this.multicall): Promise<UserPyInfo> {
        return this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, multicall);
    }

    async getInfo(multicall = this.multicall): Promise<PyInfo> {
        return this.routerStatic.multicallStatic.getPYInfo(this.address, multicall);
    }

    async SCY(multicall = this.multicall): Promise<Address> {
        return this.ptContract.multicallStatic.SCY(multicall);
    }

    /**
     * Alias for PT#SCY
     * @see PtEntity#SCY
     */
    async scy(multicall = this.multicall) {
        return this.SCY(multicall);
    }

    async YT(multicall = this.multicall): Promise<Address> {
        return this.ptContract.multicallStatic.YT(multicall);
    }

    /**
     * Alias for PT#YT
     * @see PtEntity#YT
     */
    async yt(multicall = this.multicall) {
        return this.YT(multicall);
    }

    async scyEntity(multicall = this.multicall) {
        const scyAddr = await this.SCY(multicall);
        return new ScyEntity(scyAddr, this.networkConnection, this.chainId);
    }

    async ytEntity(multicall = this.multicall) {
        const ytAddr = await this.YT(multicall);
        return new YtEntity(ytAddr, this.networkConnection, this.chainId);
    }
}
