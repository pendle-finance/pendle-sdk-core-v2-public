import type { PendleVotingControllerUpg } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { BigNumber } from 'bignumber.js';
import { BigNumber as BN, Contract, constants } from 'ethers';
import { abi as PendleVotingControllerUpgABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingController/PendleVotingControllerUpg.sol/PendleVotingControllerUpg.json';
import { isMainchain } from './helper';
import { Market } from './Market';

export class VotingController {
    readonly contract: PendleVotingControllerUpg;

    constructor(
        public readonly address: Address,
        public readonly networkConnection: NetworkConnection,
        public readonly chainId: number
    ) {
        if (!isMainchain(chainId)) {
            throw Error('Voting only available on main chain (Ethereum)');
        }
        this.contract = new Contract(
            address,
            PendleVotingControllerUpgABI,
            networkConnection.provider
        ) as PendleVotingControllerUpg;
    }

    static scaleWeight(weight: number): BN {
        if (weight < 0 || weight > 1) {
            throw new Error('Weight must be in range [0, 1]');
        }
        return BN.from(new BigNumber(constants.WeiPerEther.toString()).times(weight).toFixed());
    }

    // async getUserTotalVotedWeight(user: Address): Promise<number> {
    //     // TODO: Uncomment this after interface update
    //     const totalVotedWeight = await this.contract.callStatic.userData(user);
    //     // const totalVotedWeight = 0;
    //     return new BigNumber(totalVotedWeight.toString()).div(constants.WeiPerEther.toString()).toNumber();
    // }

    async vote(market: Market, weight: number) {
        return this.contract.vote([market.address], [VotingController.scaleWeight(weight)]);
    }

    // async unvote(market: Market) {
    //     return this.contract.unvote(market.address);
    // }

    // async updatePoolVotes(market: Market) {
    //     return this.contract.updatePoolVotes(market.address);
    // }

    // async voteForMultiple(votes: { market: Market; weight: number }[]) {
    //     // TODO: Implement this
    // }
}
