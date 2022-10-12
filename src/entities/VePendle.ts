import type { VotingEscrowTokenBase, VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId, MainchainId } from '../types';
import { ContractInterface } from 'ethers';
import { abi as VotingEscrowTokenBaseABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingEscrow/VotingEscrowTokenBase.sol/VotingEscrowTokenBase.json';
import { abi as VotingEscrowPendleMainchainABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingEscrow/VotingEscrowPendleMainchain.sol/VotingEscrowPendleMainchain.json';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';
import { ContractLike } from '../contractHelper';

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
        return this.contract as ContractLike<VotingEscrowTokenBase>;
    }

    async positionData(userAddress: Address, multicall?: Multicall) {
        return Multicall.wrap(this.votingEscrowTokenBaseContract, multicall).callStatic.positionData(userAddress);
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

    get votingEscrowPendleMainchainContract(): ContractLike<VotingEscrowPendleMainchain> {
        return this.contract as ContractLike<VotingEscrowPendleMainchain>;
    }

    get vePendleMainchainContract() {
        return this.votingEscrowPendleMainchainContract;
    }
}
