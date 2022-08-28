import type { VotingEscrowTokenBase, VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from '../types';
import { Contract } from 'ethers';
import { abi as VotingEscrowTokenBaseABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowTokenBase.sol/VotingEscrowTokenBase.json';
import { abi as VotingEscrowPendleMainchainABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowPendleMainchain.sol/VotingEscrowPendleMainchain.json';
import { isMainchain } from './helper';
import { ERC20 } from './ERC20';

export class VePendle {
    readonly ERC20: ERC20;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
    }

    get contract() {
        /* eslint-disable indent */
        return isMainchain(this.chainId)
            ? (new Contract(
                  this.address,
                  VotingEscrowPendleMainchainABI,
                  this.networkConnection.provider
              ) as VotingEscrowPendleMainchain)
            : (new Contract(
                  this.address,
                  VotingEscrowTokenBaseABI,
                  this.networkConnection.provider
              ) as VotingEscrowTokenBase);
        /* eslint-enable indent */
    }
}
