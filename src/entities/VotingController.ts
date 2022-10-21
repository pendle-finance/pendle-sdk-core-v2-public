import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';

import { PendleVotingControllerUpg, PendleVotingControllerUpgABI, WrappedContract, MetaMethodType } from '../contracts';
import type { Address, ChainId } from '../types';
import { BigNumber } from 'bignumber.js';
import { BigNumber as BN, constants } from 'ethers';
import { isMainchain } from './helper';
import { MarketEntity } from './MarketEntity';

export type VotingControllerConfig = PendleEntityConfigOptionalAbi;

export class VotingController<
    C extends WrappedContract<PendleVotingControllerUpg> = WrappedContract<PendleVotingControllerUpg>
> extends PendleEntity<C> {
    constructor(readonly address: Address, readonly chainId: ChainId, config: VotingControllerConfig) {
        if (!isMainchain(chainId)) {
            throw Error('Voting only available on main chain (Ethereum)');
        }
        super(address, chainId, { abi: PendleVotingControllerUpgABI, ...config });
    }

    static scaleWeight(weight: number): BN {
        if (weight < 0 || weight > 1) throw new Error('Weight must be in range [0, 1]');
        return BN.from(new BigNumber(constants.WeiPerEther.toString()).times(weight).toFixed());
    }

    // TODO: Uncomment this after the relevant view function is written
    // async getUserTotalVotedWeight(user: Address): Promise<number> {
    //     const totalVotedWeight = await this.contract.callStatic.userData(user);
    //     return new BigNumber(totalVotedWeight.toString()).div(constants.WeiPerEther.toString()).toNumber();
    // }

    async vote<T extends MetaMethodType = 'send'>(
        votes: { market: MarketEntity; weight: number }[],
        metaMethodType?: T
    ) {
        return this.contract.metaCall.vote(
            votes.map(({ market }) => market.address),
            votes.map(({ weight }) => VotingController.scaleWeight(weight)),
            metaMethodType
        );
    }
}
