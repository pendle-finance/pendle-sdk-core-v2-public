import type { PendleVotingControllerUpg } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { BigNumber } from 'bignumber.js';
import { type ContractTransaction, type Overrides, BigNumber as BN, Contract, constants } from 'ethers';
import { abi as PendleVotingControllerUpgABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingController/PendleVotingControllerUpg.sol/PendleVotingControllerUpg.json';
import { isMainchain } from './helper';
import { Market } from './Market';

export class VotingController {
    readonly contract: PendleVotingControllerUpg;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
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
        if (weight < 0 || weight > 1) throw new Error('Weight must be in range [0, 1]');
        return BN.from(new BigNumber(constants.WeiPerEther.toString()).times(weight).toFixed());
    }

    // TODO: Uncomment this after the relevant view function is written
    // async getUserTotalVotedWeight(user: Address): Promise<number> {
    //     const totalVotedWeight = await this.contract.callStatic.userData(user);
    //     return new BigNumber(totalVotedWeight.toString()).div(constants.WeiPerEther.toString()).toNumber();
    // }

    async vote(votes: { market: Market; weight: number }[], overrides: Overrides = {}): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).vote(
            votes.map(({ market }) => market.address),
            votes.map(({ weight }) => VotingController.scaleWeight(weight)),
            overrides
        );
    }
}
