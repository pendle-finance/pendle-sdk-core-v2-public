import type { PendleYieldToken, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount } from '../types';
import { BigNumber as BN, Contract } from 'ethers';
import { abi as PendleYieldTokenABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldToken.sol/PendleYieldToken.json';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';

export type UserPYInfo = {
    yt: Address;
    ytBalance: BN;
    pt: Address;
    ptBalance: BN;
    unclaimedInterest: TokenAmount;
    unclaimedRewards: TokenAmount[];
};

export type PYInfo = {
    exchangeRate: BN;
    totalSupply: BN;
    rewardIndexes: RewardIndex[];
};

export type RewardIndex = {
    rewardToken: Address;
    index: BN;
};

export class YT {
    readonly ERC20: ERC20;
    readonly contract: PendleYieldToken;
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this.contract = new Contract(address, PendleYieldTokenABI, networkConnection.provider) as PendleYieldToken;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserPYInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYInfo(this.address, user);
    }

    async getInfo(multicall?: Multicall): Promise<PYInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getPYInfo(this.address);
    }

    async PT(multicall?: Multicall): Promise<Address> {
        return Multicall.wrap(this.contract, multicall).callStatic.PT();
    }
}
