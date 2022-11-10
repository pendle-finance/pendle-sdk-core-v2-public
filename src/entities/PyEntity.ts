import { RouterStatic, WrappedContract } from '../contracts';
import type { Address, RawTokenAmount, ChainId, MulticallStaticParams } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, toAddress, createTokenAmount } from './helper';
import { ERC20, ERC20Config } from './ERC20';

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

export type PyEntityConfig = ERC20Config;

export abstract class PyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: PyEntityConfig) {
        super(address, chainId, { ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    async userInfo(user: Address, params?: MulticallStaticParams): Promise<UserPyInfo> {
        return this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, params).then(PyEntity.toUserPyInfo);
    }

    static toUserPyInfo({
        yt,
        ytBalance,
        pt,
        ptBalance,
        unclaimedRewards,
        unclaimedInterest,
    }: RouterStatic.UserPYInfoStruct): UserPyInfo {
        return {
            yt: toAddress(yt),
            pt: toAddress(pt),
            ytBalance: BN.from(ytBalance),
            ptBalance: BN.from(ptBalance),
            unclaimedInterest: createTokenAmount(unclaimedInterest),
            unclaimedRewards: unclaimedRewards.map(createTokenAmount),
        };
    }

    async getInfo(params?: MulticallStaticParams): Promise<PyInfo> {
        const { exchangeRate, totalSupply, rewardIndexes } = await this.routerStatic.multicallStatic.getPYInfo(
            this.address,
            params
        );
        return {
            exchangeRate,
            totalSupply,
            rewardIndexes: rewardIndexes.map(({ rewardToken, index }) => ({
                rewardToken: toAddress(rewardToken),
                index,
            })),
        };
    }
}
