import type { PendleYieldToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount, ChainId } from '../types';
import { BigNumber as BN, Contract } from 'ethers';
import { abi as PendleYieldTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldToken.sol/PendleYieldToken.json';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';
import { PtEntity } from './PtEntity';
import { ScyEntity } from './ScyEntity';

export type UserPyInfo = {
    yt: Address;
    ytBalance: BN;
    pt: Address;
    ptBalance: BN;
    unclaimedInterest: TokenAmount;
    unclaimedRewards: TokenAmount[];
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

export class YtEntity {
    readonly ERC20: ERC20;
    readonly contract: PendleYieldToken;
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this.contract = new Contract(address, PendleYieldTokenABI, networkConnection.provider) as PendleYieldToken;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async name(multicall?: Multicall) {
        return Multicall.wrap(this.contract, multicall).callStatic.name();
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserPyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(multicall?: Multicall): Promise<PyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getPYInfo(this.address);
    }

    async SCY(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.contract, multicall).callStatic.SCY();
    }

    /**
     * Alias for YT#SCY
     * @see YtEntity#SCY
     */
    async scy(multicall?: Multicall) {
        return this.SCY(multicall);
    }

    async PT(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.contract, multicall).callStatic.PT();
    }

    /**
     * Alias for YT#PT
     * @see YtEntity#PT
     */
    async pt(multicall?: Multicall) {
        return this.PT(multicall);
    }

    async scyEntity(multicall?: Multicall) {
        const scyAddr = await this.SCY(multicall);
        return new ScyEntity(scyAddr, this.networkConnection, this.chainId);
    }

    async ptEntity(multicall?: Multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.networkConnection, this.chainId);
    }

    async pyIndexCurrent(multicall?: Multicall) {
        return Multicall.wrap(this.contract, multicall).callStatic.pyIndexCurrent();
    }

    async getRewardTokens(multicall?: Multicall) {
        return Multicall.wrap(this.contract, multicall).callStatic.getRewardTokens();
    }
}
