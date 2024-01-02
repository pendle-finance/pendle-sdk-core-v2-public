import { IPActionInfoStatic, MulticallStaticParams } from '../contracts';
import { BigNumber as BN } from 'ethers';
import { ERC20Entity, ERC20EntityConfig } from './erc20';
import { Address, RawTokenAmount, createTokenAmount, ChainId } from '../common';
import { Multicall } from '../multicall';

import { type PtEntity, type PtEntityConfig } from './PtEntity';
import { type YtEntity, type YtEntityConfig } from './YtEntity';
import { type SyEntity, type SyEntityConfig } from './SyEntity';

import * as iters from 'itertools';

export type UserPyInfo = {
    ytBalance: RawTokenAmount;
    ptBalance: RawTokenAmount;
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

/**
 * Configuration for a {@link PyEntity}
 */
export type PyEntityConfig = ERC20EntityConfig & {
    chainId: ChainId;
};

/**
 * A super class for PT token and YT token.
 * @remarks
 * As PT and YT come in pair, they share some functionalities.
 * Those shared functionalities are included in this class.
 *
 * There is no `contract` getter for this class, as there is no
 * base ABI for both PT and YT. This should be done in the subclasses.
 */
export abstract class PyEntity extends ERC20Entity {
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: PyEntityConfig) {
        super(address, { ...config });
        this.chainId = config.chainId;
    }

    abstract PT(params?: MulticallStaticParams): Promise<Address>;
    abstract YT(params?: MulticallStaticParams): Promise<Address>;
    abstract SY(params?: MulticallStaticParams): Promise<Address>;
    abstract ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }): Promise<PtEntity>;
    abstract ytEntity(params?: MulticallStaticParams & { entityConfig?: YtEntityConfig }): Promise<YtEntity>;
    abstract syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }): Promise<SyEntity>;

    /**
     * Alias for {@link PyEntity#YT}
     */
    yt(params?: MulticallStaticParams) {
        return this.YT(params);
    }

    /**
     * Alias for {@link PyEntity#PT}
     */
    pt(params?: MulticallStaticParams) {
        return this.PT(params);
    }

    /**
     * Alias for {@link PtEntity#SY}
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    get entityConfig(): PyEntityConfig {
        return { ...super.entityConfig, chainId: this.chainId };
    }

    /**
     * Get user information of the current PY token.
     * @param user
     * @param params - the additional parameters for read method.
     * @returns
     */
    async userInfo(
        user: Address,
        params?: MulticallStaticParams & {
            multicallForSimulateRedeemDueInterestAndRewards?: Multicall;
        }
    ): Promise<UserPyInfo> {
        const [ptEntity, ytEntity, syAddress] = await Promise.all([
            this.ptEntity(params),
            this.ytEntity(params),
            this.SY(params),
        ]);
        const [ptBalance, ytBalance, rewardTokens, { interestOut, rewardsOut }] = await Promise.all([
            ptEntity.balanceOf(user, params),
            ytEntity.balanceOf(user, params),
            ytEntity.getRewardTokens(),
            ytEntity.redeemDueInterestAndRewards(user, {
                method: 'multicallStatic',
                multicall: params?.multicallForSimulateRedeemDueInterestAndRewards,
                redeemInterest: true,
                redeemRewards: true,
            }),
        ]);
        return {
            ptBalance: { token: ptEntity.address, amount: ptBalance },
            ytBalance: { token: ytEntity.address, amount: ytBalance },
            unclaimedInterest: { token: syAddress, amount: interestOut },
            unclaimedRewards: iters.map(iters.izip(rewardTokens, rewardsOut), ([token, amount]) => ({ token, amount })),
        };
    }

    /**
     * Convert {@link IPRouterStatic.UserPYInfoStructOutput} to {@link UserPyInfo}.
     * @remarks
     * Both structures have the same shape, but the return type has a stricter type.
     * @param userPyInfoStructOutput
     * @returns
     */
    static toUserPyInfo({
        ytBalance,
        ptBalance,
        unclaimedRewards,
        unclaimedInterest,
    }: IPActionInfoStatic.UserPYInfoStructOutput): UserPyInfo {
        return {
            ytBalance: createTokenAmount(ytBalance),
            ptBalance: createTokenAmount(ptBalance),
            unclaimedInterest: createTokenAmount(unclaimedInterest),
            unclaimedRewards: unclaimedRewards.map(createTokenAmount),
        };
    }
}
