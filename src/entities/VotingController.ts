import type { PendleVotingControllerUpg } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { BigNumber } from 'bignumber.js';
import { BigNumber as BN, constants, ContractInterface } from 'ethers';
import { abi as PendleVotingControllerUpgABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingController/PendleVotingControllerUpg.sol/PendleVotingControllerUpg.json';
import { isMainchain } from './helper';
import { MarketEntity } from './MarketEntity';
import { WrappedContract, createContractObject, MetaMethodType } from '../contractHelper';
import { Multicall } from '../multicall';

export type VotingControllerConfig = {
    abi?: ContractInterface;
    multicall?: Multicall;
};

export class VotingController {
    readonly contract: WrappedContract<PendleVotingControllerUpg>;
    readonly multicall?: Multicall;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config: VotingControllerConfig = {}
    ) {
        if (!isMainchain(chainId)) {
            throw Error('Voting only available on main chain (Ethereum)');
        }
        const abi = config.abi ?? PendleVotingControllerUpgABI;
        this.contract = createContractObject<PendleVotingControllerUpg>(address, abi, networkConnection, {
            multicall: config.multicall,
        });
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
