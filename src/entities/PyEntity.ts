import { RouterStatic, WrappedContract, MulticallStaticParams, getRouterStatic } from '../contracts';
import { BigNumber as BN } from 'ethers';
import { ERC20, ERC20Config } from './ERC20';
import { Address, toAddress, RawTokenAmount, createTokenAmount, ChainId } from '../common';

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

export type PyEntityConfig = ERC20Config & {
    chainId: ChainId;
};

export abstract class PyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: PyEntityConfig) {
        super(address, { ...config });
        this.chainId = config.chainId;
        this.routerStatic = getRouterStatic(config);
    }

    get entityConfig(): PyEntityConfig {
        return { ...super.entityConfig, chainId: this.chainId };
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
    }: RouterStatic.UserPYInfoStructOutput): UserPyInfo {
        return {
            yt: toAddress(yt),
            pt: toAddress(pt),
            ytBalance: ytBalance,
            ptBalance: ptBalance,
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
