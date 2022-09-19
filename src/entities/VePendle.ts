import type { VotingEscrowTokenBase, VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId, MainchainId } from '../types';
import { ContractInterface } from 'ethers';
import { abi as VotingEscrowTokenBaseABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowTokenBase.sol/VotingEscrowTokenBase.json';
import { abi as VotingEscrowPendleMainchainABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowPendleMainchain.sol/VotingEscrowPendleMainchain.json';
import { ERC20 } from './ERC20';

export class VePendle extends ERC20 {
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = VotingEscrowTokenBaseABI
    ) {
        super(address, networkConnection, chainId, abi);
    }

    get votingEscrowTokenBaseContract() {
        return this.contract as VotingEscrowTokenBase;
    }
}

export class VePendleMainchain extends VePendle {
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: MainchainId,
        abi: ContractInterface = VotingEscrowPendleMainchainABI
    ) {
        super(address, networkConnection, chainId, abi);
    }

    get votingEscrowPendleMainchainContract(): VotingEscrowPendleMainchain {
        return this.contract as VotingEscrowPendleMainchain;
    }

    get vePendleMainchainContract() {
        return this.votingEscrowPendleMainchainContract;
    }
}
