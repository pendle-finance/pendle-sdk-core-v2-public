import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';

import {
    PendleVotingControllerUpg,
    PendleVotingControllerUpgABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MetaMethodReturnType,
    ContractMethodNames,
} from '../contracts';
import { Address, BN, ethersConstants } from '../common';
import { BigNumber } from 'bignumber.js';
import { MarketEntity } from './MarketEntity';

/**
 * Configuration for {@link VotingController}
 */
export type VotingControllerConfig = PendleEntityConfigOptionalAbi;

export type VotingControllerMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<PendleVotingControllerUpg>,
    ExtraData extends {}
> = MetaMethodReturnType<T, PendleVotingControllerUpg, MethodName, ExtraData & MetaMethodExtraParams<T>>;

export class VotingController extends PendleEntity {
    constructor(readonly address: Address, config: VotingControllerConfig) {
        super(address, { abi: PendleVotingControllerUpgABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @remarks
     * It is intended to be overridden in the subclasses.
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendleVotingControllerUpg>;
    }

    /**
     * Scale a floating point `weight` to fixed point number
     * @param weight
     * @returns
     */
    static scaleWeight(weight: number): BN {
        if (weight < 0 || weight > 1) throw new Error('Weight must be in range [0, 1]');
        // TODO declare constant instead of using ethersConstant
        return BN.from(new BigNumber(ethersConstants.WeiPerEther.toString()).times(weight).toFixed());
    }

    // TODO: Uncomment this after the relevant view function is written
    // async getUserTotalVotedWeight(user: Address): Promise<number> {
    //     const totalVotedWeight = await this.contract.callStatic.userData(user);
    //     return new BigNumber(totalVotedWeight.toString()).div(ethersConstants.WeiPerEther.toString()).toNumber();
    // }

    /**
     * Perform the vote action.
     *
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param votes - the votes, which is a list of pair of a {@link MarketEntity} and the weight.
     * @param params - the additional parameters for **write** method.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async vote<T extends MetaMethodType>(
        votes: { market: MarketEntity; weight: number }[],
        params: MetaMethodExtraParams<T> = {}
    ): VotingControllerMetaMethodReturnType<T, 'vote', {}> {
        return this.contract.metaCall.vote(
            votes.map(({ market }) => market.address),
            votes.map(({ weight }) => VotingController.scaleWeight(weight)),
            this.addExtraParams(params)
        );
    }
}
