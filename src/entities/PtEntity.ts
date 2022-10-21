import { PendlePrincipalToken, RouterStatic, PendlePrincipalTokenABI, WrappedContract } from '../contracts';
import type { Address, ChainId } from '../types';
import type { UserPyInfo, PyInfo } from './YtEntity';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { YtEntity } from './YtEntity';
import { SyEntity } from './SyEntity';

export type PtEntityConfig = ERC20Config;

export class PtEntity<
    C extends WrappedContract<PendlePrincipalToken> = WrappedContract<PendlePrincipalToken>
> extends ERC20<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: PtEntityConfig) {
        super(address, chainId, { abi: PendlePrincipalTokenABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    async userInfo(user: Address, multicall = this.multicall): Promise<UserPyInfo> {
        return this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, multicall);
    }

    async getInfo(multicall = this.multicall): Promise<PyInfo> {
        return this.routerStatic.multicallStatic.getPYInfo(this.address, multicall);
    }

    async SY(multicall = this.multicall): Promise<Address> {
        return this.contract.multicallStatic.SY(multicall);
    }

    /**
     * Alias for PT#SY
     * @see PtEntity#SY
     */
    async sy(multicall = this.multicall) {
        return this.SY(multicall);
    }

    async YT(multicall = this.multicall): Promise<Address> {
        return this.contract.multicallStatic.YT(multicall);
    }

    /**
     * Alias for PT#YT
     * @see PtEntity#YT
     */
    async yt(multicall = this.multicall) {
        return this.YT(multicall);
    }

    async syEntity(multicall = this.multicall) {
        const syAddr = await this.SY(multicall);
        return new SyEntity(syAddr, this.chainId, this.networkConnection);
    }

    async ytEntity(multicall = this.multicall) {
        const ytAddr = await this.YT(multicall);
        return new YtEntity(ytAddr, this.chainId, this.networkConnection);
    }
}
