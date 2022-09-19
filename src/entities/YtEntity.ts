import type { PendleYieldToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount, ChainId } from '../types';
import { BigNumber as BN, ContractInterface } from 'ethers';
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

export class YtEntity extends ERC20 {
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = PendleYieldTokenABI
    ) {
        super(address, networkConnection, chainId, abi);
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    get pendleYieldTokenContract() {
        return this.contract as PendleYieldToken;
    }

    get ytContract() {
        return this.pendleYieldTokenContract;
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserPyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(multicall?: Multicall): Promise<PyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getPYInfo(this.address);
    }

    async SCY(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.ytContract, multicall).callStatic.SCY();
    }

    /**
     * Alias for YT#SCY
     * @see YtEntity#SCY
     */
    async scy(multicall?: Multicall) {
        return this.SCY(multicall);
    }

    async PT(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.ytContract, multicall).callStatic.PT();
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
        return Multicall.wrap(this.ytContract, multicall).callStatic.pyIndexCurrent();
    }

    async getRewardTokens(multicall?: Multicall) {
        return Multicall.wrap(this.ytContract, multicall).callStatic.getRewardTokens();
    }
}
