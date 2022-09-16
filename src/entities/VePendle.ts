import type { VotingEscrowTokenBase, VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId, MainchainId } from '../types';
import { Contract } from 'ethers';
import { abi as VotingEscrowTokenBaseABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowTokenBase.sol/VotingEscrowTokenBase.json';
import { abi as VotingEscrowPendleMainchainABI } from '@pendle/core-v2/build/artifacts/contracts/core/LiquidityMining/VotingEscrow/VotingEscrowPendleMainchain.sol/VotingEscrowPendleMainchain.json';
import { isMainchain } from './helper';
import { ERC20 } from './ERC20';

export class VePendle {
    readonly ERC20: ERC20;
    protected _contract: VotingEscrowTokenBase | VotingEscrowPendleMainchain;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this._contract = new Contract(
            address,
            isMainchain(chainId) ? VotingEscrowPendleMainchainABI : VotingEscrowTokenBaseABI,
            networkConnection.provider
        ) as VotingEscrowPendleMainchain | VotingEscrowTokenBase;
    }

    get contract(): VotingEscrowTokenBase | VotingEscrowPendleMainchain {
        return this._contract;
    }
}

export class VePendleMainchain extends VePendle {
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: MainchainId
    ) {
        super(address, networkConnection, chainId);
    }

    get contract(): VotingEscrowPendleMainchain {
        return this._contract as VotingEscrowPendleMainchain;
    }
}
