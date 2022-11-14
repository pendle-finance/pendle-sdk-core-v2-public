import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';

import {
    PendleVotingControllerUpg,
    PendleVotingControllerUpgABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
} from '../contracts';
import { Address, BN, ethersConstants } from '../common';
import { BigNumber } from 'bignumber.js';
import { MarketEntity } from './MarketEntity';

export type VotingControllerConfig = PendleEntityConfigOptionalAbi;

export class VotingController extends PendleEntity {
    constructor(readonly address: Address, config: VotingControllerConfig) {
        super(address, { abi: PendleVotingControllerUpgABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleVotingControllerUpg>;
    }

    static scaleWeight(weight: number): BN {
        if (weight < 0 || weight > 1) throw new Error('Weight must be in range [0, 1]');
        return BN.from(new BigNumber(ethersConstants.WeiPerEther.toString()).times(weight).toFixed());
    }

    // TODO: Uncomment this after the relevant view function is written
    // async getUserTotalVotedWeight(user: Address): Promise<number> {
    //     const totalVotedWeight = await this.contract.callStatic.userData(user);
    //     return new BigNumber(totalVotedWeight.toString()).div(ethersConstants.WeiPerEther.toString()).toNumber();
    // }

    async vote<T extends MetaMethodType>(
        votes: { market: MarketEntity; weight: number }[],
        params: MetaMethodExtraParams<T> = {}
    ) {
        return this.contract.metaCall.vote(
            votes.map(({ market }) => market.address),
            votes.map(({ weight }) => VotingController.scaleWeight(weight)),
            this.addExtraParams(params)
        );
    }
}
