import {
    RouterStatic,
    VotingEscrowTokenBase,
    VotingEscrowPendleMainchain,
    VotingEscrowTokenBaseABI,
    VotingEscrowPendleMainchainABI,
    WrappedContract,
    MetaMethodType,
} from '../contracts';

import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import type { Address, NetworkConnection, ChainId, MainchainId } from '../types';
import { getContractAddresses, getRouterStatic } from './helper';
import { BigNumberish } from 'ethers';

export type VePendleConfig = PendleEntityConfigOptionalAbi;

export class VePendle<
    C extends WrappedContract<VotingEscrowTokenBase> = WrappedContract<VotingEscrowTokenBase>
> extends PendleEntity<C> {
    constructor(readonly address: Address, readonly chainId: ChainId, config: VePendleConfig) {
        super(address, chainId, { abi: VotingEscrowTokenBaseABI, ...config });
    }

    async balanceOf(userAddress: Address, multicall = this.multicall) {
        return this.contract.multicallStatic.balanceOf(userAddress, multicall);
    }

    async positionData(userAddress: Address, multicall = this.multicall) {
        return this.contract.multicallStatic.positionData(userAddress, multicall);
    }

    async totalSupplyCurrent(multicall = this.multicall) {
        return this.contract.multicallStatic.totalSupplyStored(multicall);
    }
}

export type VePendleMainchainConfig = VePendleConfig;

export class VePendleMainchain<
    C extends WrappedContract<VotingEscrowPendleMainchain> = WrappedContract<VotingEscrowPendleMainchain>
> extends VePendle<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: MainchainId, config: VePendleMainchainConfig) {
        super(address, chainId, { abi: VotingEscrowPendleMainchainABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    static createObject(chainId: MainchainId, networkConnection: NetworkConnection) {
        return new VePendleMainchain(getContractAddresses(chainId).VEPENDLE, chainId, networkConnection);
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
        return this.contract.metaCall.increaseLockPosition(additionalRawAmountToLock, newExpiry_s, metaMethodType);
    }

    async withdraw<T extends MetaMethodType = 'send'>(metaMethodType?: T) {
        return this.contract.metaCall.withdraw(metaMethodType);
    }
}
