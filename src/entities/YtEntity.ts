import { PendleYieldToken, RouterStatic, PendleYieldTokenABI, WrappedContract } from '../contracts';
import type { Address, RawTokenAmount, ChainId } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { PtEntity } from './PtEntity';
import { SyEntity } from './SyEntity';

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

export class YtEntity<
    C extends WrappedContract<PendleYieldToken> = WrappedContract<PendleYieldToken>
> extends ERC20<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: YtEntityConfig) {
        super(address, chainId, { abi: PendleYieldTokenABI, ...config });
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
     * Alias for YT#SY
     * @see YtEntity#SY
     */
    async sy(multicall = this.multicall) {
        return this.SY(multicall);
    }

    async PT(multicall = this.multicall): Promise<Address> {
        return this.contract.multicallStatic.PT(multicall);
    }

    /**
     * Alias for YT#PT
     * @see YtEntity#PT
     */
    async pt(multicall = this.multicall) {
        return this.PT(multicall);
    }

    async syEntity(multicall = this.multicall) {
        const syAddr = await this.SY(multicall);
        return new SyEntity(syAddr, this.chainId, this.networkConnection);
    }

    async ptEntity(multicall = this.multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.chainId, this.networkConnection);
    }

    async pyIndexCurrent(multicall = this.multicall) {
        return this.contract.multicallStatic.pyIndexCurrent(multicall);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.contract.multicallStatic.getRewardTokens(multicall);
    }
}
