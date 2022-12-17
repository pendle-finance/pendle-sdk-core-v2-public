import {
    RouterStatic,
    WrappedContract,
    MulticallStaticParams,
    getRouterStatic,
    PendleYieldTokenABI,
} from '../contracts';
import { BigNumber as BN } from 'ethers';
import { ERC20Entity, ERC20EntityConfig } from './erc20';
import { Address, toAddress, RawTokenAmount, createTokenAmount, ChainId } from '../common';
import { YtEntity } from './YtEntity';

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

    /**
     * Get user information of the current PY token.
     * @param user
     * @param params - the additional parameters for read method.
     * @returns
     */
    async userInfo(user: Address, params?: MulticallStaticParams): Promise<UserPyInfo> {
        const { yt } = await this.routerStatic.multicallStatic.getPY(this.address, params);
        const ytEntity = new YtEntity(toAddress(yt), {
            ...this.entityConfig,
            abi: PendleYieldTokenABI,
        });

        const [userPyCurrentInfo, simulateInterestAndRewards, rewardTokens] = await Promise.all([
            this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, params),
            ytEntity.contract.multicallStatic.redeemDueInterestAndRewards(user, true, true, params),
            ytEntity.getRewardTokens(params),
        ]);

        const unclaimedRewards: RouterStatic.TokenAmountStructOutput[] = rewardTokens.map((token, i) => {
            return Object.assign([token, simulateInterestAndRewards.rewardsOut[i]] as [string, BN], {
                token,
                amount: simulateInterestAndRewards.rewardsOut[i],
            });
        });

        return PyEntity.toUserPyInfo({
            ...userPyCurrentInfo,
            unclaimedInterest: {
                ...userPyCurrentInfo.unclaimedInterest,
                amount: simulateInterestAndRewards.interestOut,
                [1]: simulateInterestAndRewards.interestOut,
            },
            unclaimedRewards,
        });
    }

    /**
     * Convert {@link RouterStatic.UserPYInfoStructOutput} to {@link UserPyInfo}.
     * @remarks
     * Both structures have the same shape, but the return type has a stricter type.
     * @param userPyInfoStructOutput
     * @returns
     */
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

    /**
     * Get the overall information of the current PY token.
     * @param params - the additional parameters for read method.
     * @returns
     */
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
