import { PendlePrincipalToken, RouterStatic, PendlePrincipalTokenABI, WrappedContract } from '../contracts';
import type { Address, ChainId } from '../types';
import type { UserPyInfo, PyInfo } from './YtEntity';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { YtEntity, YtEntityConfig } from './YtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { Multicall } from '../multicall';

export type PtEntityConfig = ERC20Config;

export class PtEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: PtEntityConfig) {
        super(address, chainId, { abi: PendlePrincipalTokenABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    get contract() {
        return this._contract as WrappedContract<PendlePrincipalToken>;
    }

    async userInfo(user: Address, params?: { multicall?: Multicall }): Promise<UserPyInfo> {
        return this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, params);
    }

    async getInfo(params?: { multicall?: Multicall }): Promise<PyInfo> {
        return this.routerStatic.multicallStatic.getPYInfo(this.address, params);
    }

    async SY(params?: { multicall?: Multicall }): Promise<Address> {
        return this.contract.multicallStatic.SY(params);
    }

    /**
     * Alias for PT#SY
     * @see PtEntity#SY
     */
    async sy(params?: { multicall?: Multicall }) {
        return this.SY(params);
    }

    async YT(params?: { multicall?: Multicall }): Promise<Address> {
        return this.contract.multicallStatic.YT(params);
    }

    /**
     * Alias for PT#YT
     * @see PtEntity#YT
     */
    async yt(params?: { multicall?: Multicall }) {
        return this.YT(params);
    }

    async syEntity(params?: { multicall?: Multicall; entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async ytEntity(params?: { multicall?: Multicall; entityConfig?: YtEntityConfig }) {
        const ytAddr = await this.YT(params);
        return new YtEntity(ytAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }
}
