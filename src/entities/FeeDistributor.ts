import { BigNumber as BN } from 'ethers';
import { Address, ChainId, getContractAddresses, toAddress, toAddresses, zip } from '../common';
import {
    ContractMethodNames,
    MetaMethodExtraParams,
    MetaMethodReturnType,
    MetaMethodType,
    MulticallStaticParams,
    PendleFeeDistributor,
    PendleFeeDistributorABI,
    WrappedContract,
} from '../contracts';
import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleSdkError } from '../errors';

export type PoolReward = {
    amount: BN;
    pool: Address;
};

/**
 * Configuration for {@link FeeDistributor}
 */
export type FeeDistributorConfig = PendleEntityConfigOptionalAbi;

export type FeeDistributorConfigWithChainId = FeeDistributorConfig & { chainId: ChainId };

export type FeeDistributorMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<PendleFeeDistributor>,
    ExtraData extends object = object
> = MetaMethodReturnType<T, PendleFeeDistributor, MethodName, ExtraData & MetaMethodExtraParams<T>>;

export class FeeDistributor extends PendleEntity {
    constructor(readonly address: Address, config: FeeDistributorConfig) {
        super(address, { abi: PendleFeeDistributorABI, ...config });
    }
    /**
     * Create a FeeDistributor object for a given config.
     * @remarks
     * The address of {@link FeeDistributor} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getFeeDistributor(config: FeeDistributorConfigWithChainId): FeeDistributor {
        const feeDistributorAddress = getContractAddresses(config.chainId).FEE_DISTRIBUTOR;
        if (!feeDistributorAddress) {
            throw new PendleSdkError(`Fee distributor is not deployed on chain ${config.chainId}`);
        }
        return new FeeDistributor(feeDistributorAddress, config);
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @remarks
     * It is intended to be overridden in the subclasses.
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendleFeeDistributor>;
    }

    /**
     * Return the address of the reward token
     * @param params - the additional parameters for read method.
     */
    async rewardToken(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.token(params).then(toAddress);
    }

    /**
     * Return all the pools that are eligible for claiming rewards
     * @param params - the additional parameters for read method.
     */
    async getAllPools(params?: MulticallStaticParams): Promise<Address[]> {
        return this.contract.multicallStatic.getAllPools(params).then(toAddresses);
    }

    /**
     * Claim rewards for a specific user in given markets
     *
     * @remarks
     * If params.filterEmptyRewardPools equals true, then only the pools with
     * non-zero rewards will be claimed.
     *
     * Note that the param.filterEmptyRewardPools does not filter out the result for meta-method,
     * that is, the result `data.poolRewards` will still contain the pools with zero rewards.
     *
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param user
     * @param pools
     * @param params - the additional parameters for **write** method.
     * @param params.filterEmptyRewardPools - if true, only the pools with non-zero
     *      rewards will be claimed.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */

    async claimReward<T extends MetaMethodType>(
        user: Address,
        pools: Address[],
        _params: MetaMethodExtraParams<T> & {
            filterEmptyRewardPools?: boolean;
        } = {}
    ): FeeDistributorMetaMethodReturnType<
        T,
        'claimReward',
        {
            poolRewards: PoolReward[];
            totalReward: BN;
        }
    > {
        const params = this.addExtraParams(_params);

        const amountRewardOut = await this.contract.multicallStatic.claimReward(user, pools, params);
        const totalReward = amountRewardOut.reduce((a, b) => a.add(b), BN.from(0));

        const poolRewards: PoolReward[] = Array.from(zip(pools, amountRewardOut), ([pool, amount]) => ({
            pool,
            amount,
        }));

        if (_params.filterEmptyRewardPools) {
            pools = pools.filter((_, i) => !amountRewardOut[i].isZero());
        }

        return this.contract.metaCall.claimReward(user, pools, {
            ...params,
            poolRewards,
            totalReward,
        });
    }
}
