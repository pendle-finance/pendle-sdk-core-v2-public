import type { PendleVotingControllerUpg } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { BigNumber } from 'bignumber.js';
import type { ContractTransaction, Overrides } from 'ethers';
import { BigNumber as BN, constants } from 'ethers';
import { abi as PendleVotingControllerUpgABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingController/PendleVotingControllerUpg.sol/PendleVotingControllerUpg.json';
import { isMainchain, requiresSigner } from './helper';
import { MarketEntity } from './MarketEntity';
import { ContractLike, createContractObject } from '../contractHelper';

export class VotingController {
    readonly contract: ContractLike<PendleVotingControllerUpg>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        if (!isMainchain(chainId)) {
            throw Error('Voting only available on main chain (Ethereum)');
        }
        this.contract = createContractObject<PendleVotingControllerUpg>(
            address,
            PendleVotingControllerUpgABI,
            networkConnection
        );
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

    @requiresSigner
    async vote(
        votes: { market: MarketEntity; weight: number }[],
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        return this.contract.vote(
            votes.map(({ market }) => market.address),
            votes.map(({ weight }) => VotingController.scaleWeight(weight)),
            overrides
        );
    }
}
