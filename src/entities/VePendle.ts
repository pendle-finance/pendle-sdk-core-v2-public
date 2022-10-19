import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import type { VotingEscrowTokenBase, VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId, MainchainId } from '../types';
import { abi as VotingEscrowTokenBaseABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingEscrow/VotingEscrowTokenBase.sol/VotingEscrowTokenBase.json';
import { abi as VotingEscrowPendleMainchainABI } from '@pendle/core-v2/build/artifacts/contracts/LiquidityMining/VotingEscrow/VotingEscrowPendleMainchain.sol/VotingEscrowPendleMainchain.json';
import { ERC20, ERC20Config } from './ERC20';
import { Multicall } from '../multicall';
import { WrappedContract, MetaMethodType } from '../contractHelper';
import { getContractAddresses, getRouterStatic } from './helper';
import { BigNumberish } from 'ethers';

export type VePendleConfig = ERC20Config;

export class VePendle extends ERC20 {
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: VePendleConfig
    ) {
        super(address, networkConnection, chainId, { abi: VotingEscrowTokenBaseABI, ...config });
    }

    get votingEscrowTokenBaseContract() {
        return this.contract as WrappedContract<VotingEscrowTokenBase>;
    }

    async positionData(userAddress: Address, multicall = this.multicall) {
        return Multicall.wrap(this.votingEscrowTokenBaseContract, multicall).callStatic.positionData(userAddress);
    }
}

export type VePendleMainchainConfig = VePendleConfig;

export class VePendleMainchain extends VePendle {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: MainchainId,
        config?: VePendleMainchainConfig
    ) {
        super(address, networkConnection, chainId, { abi: VotingEscrowPendleMainchainABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    get votingEscrowPendleMainchainContract(): WrappedContract<VotingEscrowPendleMainchain> {
        return this.contract as WrappedContract<VotingEscrowPendleMainchain>;
    }

    get vePendleMainchainContract() {
        return this.votingEscrowPendleMainchainContract;
    }

    static createObject(networkConnection: NetworkConnection, chainId: MainchainId) {
        return new VePendleMainchain(getContractAddresses(chainId).VEPENDLE, networkConnection, chainId);
    }

    async simulateIncreaseLockPosition(
        userAddress: Address,
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        multicall = this.multicall
    ) {
        return this.routerStatic.multicallStatic.increaseLockPositionStatic(
            userAddress,
            additionalRawAmountToLock,
            newExpiry_s,
            multicall
        );
    }

    async increaseLockPosition<T extends MetaMethodType = 'send'>(
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        metaMethodType?: T
    ) {
        return this.vePendleMainchainContract.metaCall.increaseLockPosition(
            additionalRawAmountToLock,
            newExpiry_s,
            metaMethodType
        );
    }

    async withdraw<T extends MetaMethodType = 'send'>(metaMethodType?: T) {
        return this.vePendleMainchainContract.metaCall.withdraw(metaMethodType);
    }
}
