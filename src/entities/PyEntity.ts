import {
    IPRouterStatic,
    IPActionInfoStatic,
    WrappedContract,
    MulticallStaticParams,
    getRouterStatic,
} from '../contracts';
import { BigNumber as BN } from 'ethers';
import { ERC20Entity, ERC20EntityConfig } from './erc20';
import { Address, RawTokenAmount, createTokenAmount, ChainId } from '../common';

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
    protected readonly routerStatic: WrappedContract<IPRouterStatic>;
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
        const pyInfo = await this.routerStatic.multicallStatic.getUserPYInfo(this.address, user, params);
        return PyEntity.toUserPyInfo(pyInfo);
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
