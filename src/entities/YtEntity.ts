import type { PendleYieldToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, RawTokenAmount, ChainId } from '../types';
import { BigNumber as BN } from 'ethers';
import { abi as PendleYieldTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldToken.sol/PendleYieldToken.json';
import { getRouterStatic } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { PtEntity } from './PtEntity';
import { ScyEntity } from './ScyEntity';
import { WrappedContract } from '../contractHelper';

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

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: YtEntityConfig
    ) {
        super(address, networkConnection, chainId, { abi: PendleYieldTokenABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId);
    }

    get pendleYieldTokenContract() {
        return this.contract as WrappedContract<PendleYieldToken>;
    }

    get ytContract() {
        return this.pendleYieldTokenContract;
    }

    async userInfo(user: Address, multicall = this.multicall): Promise<UserPyInfo> {
        return this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, multicall);
    }

    async getInfo(multicall = this.multicall): Promise<PyInfo> {
        return this.routerStatic.multicallStatic.getPYInfo(this.address, multicall);
    }

    async SCY(multicall = this.multicall): Promise<Address> {
        return this.ytContract.multicallStatic.SCY(multicall);
    }

    /**
     * Alias for YT#SCY
     * @see YtEntity#SCY
     */
    async scy(multicall = this.multicall) {
        return this.SCY(multicall);
    }

    async PT(multicall = this.multicall): Promise<Address> {
        return this.ytContract.multicallStatic.PT(multicall);
    }

    /**
     * Alias for YT#PT
     * @see YtEntity#PT
     */
    async pt(multicall = this.multicall) {
        return this.PT(multicall);
    }

    async scyEntity(multicall = this.multicall) {
        const scyAddr = await this.SCY(multicall);
        return new ScyEntity(scyAddr, this.networkConnection, this.chainId);
    }

    async ptEntity(multicall = this.multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.networkConnection, this.chainId);
    }

    async pyIndexCurrent(multicall = this.multicall) {
        return this.ytContract.multicallStatic.pyIndexCurrent(multicall);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.ytContract.multicallStatic.getRewardTokens(multicall);
    }
}
