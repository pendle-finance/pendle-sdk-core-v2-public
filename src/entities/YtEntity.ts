import { PendleYieldToken, RouterStatic, PendleYieldTokenABI, WrappedContract } from '../contracts';
import type { Address, RawTokenAmount, ChainId } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { Multicall } from '../multicall';

export type UserPyInfo = {
    yt: Address;
    ytBalance: BN;
    pt: Address;
    ptBalance: BN;
    unclaimedInterest: RawTokenAmount;
    unclaimedRewards: RawTokenAmount[];
};

export type PyInfo = {
    exchangeRate: BN;
    totalSupply: BN;
    rewardIndexes: RewardIndex[];
};

export type RewardIndex = {
    rewardToken: Address;
    index: BN;
};

export type YtEntityConfig = ERC20Config;

export class YtEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: YtEntityConfig) {
        super(address, chainId, { abi: PendleYieldTokenABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    get contract() {
        return this._contract as WrappedContract<PendleYieldToken>;
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
     * Alias for YT#SY
     * @see YtEntity#SY
     */
    async sy(params?: { multicall?: Multicall }) {
        return this.SY(params);
    }

    async PT(params?: { multicall?: Multicall }): Promise<Address> {
        return this.contract.multicallStatic.PT(params);
    }

    /**
     * Alias for YT#PT
     * @see YtEntity#PT
     */
    async pt(params?: { multicall?: Multicall }) {
        return this.PT(params);
    }

    async syEntity(params?: { multicall?: Multicall; entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async ptEntity(params?: { multicall?: Multicall; entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async pyIndexCurrent(params?: { multicall?: Multicall }) {
        return this.contract.multicallStatic.pyIndexCurrent(params);
    }

    async getRewardTokens(params?: { multicall?: Multicall }) {
        return this.contract.multicallStatic.getRewardTokens(params);
    }
}
