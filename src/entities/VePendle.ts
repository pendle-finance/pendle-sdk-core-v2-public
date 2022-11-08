import {
    RouterStatic,
    VotingEscrowTokenBase,
    VotingEscrowPendleMainchain,
    VotingEscrowTokenBaseABI,
    VotingEscrowPendleMainchainABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
} from '../contracts';
import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import type { Address, NetworkConnection, ChainId, MainchainId, MulticallStaticParams } from '../types';
import { getContractAddresses, getRouterStatic } from './helper';
import { BigNumberish } from 'ethers';

export type VePendleConfig = PendleEntityConfigOptionalAbi;

export class VePendle extends PendleEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: VePendleConfig) {
        super(address, chainId, { abi: VotingEscrowTokenBaseABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<VotingEscrowTokenBase>;
    }

    async balanceOf(userAddress: Address, params?: MulticallStaticParams) {
        return this.contract.multicallStatic.balanceOf(userAddress, params);
    }

    async positionData(userAddress: Address, params?: MulticallStaticParams) {
        return this.contract.multicallStatic.positionData(userAddress, params);
    }

    async totalSupplyCurrent(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.totalSupplyStored(params);
    }
}

export type VePendleMainchainConfig = VePendleConfig;

export class VePendleMainchain extends VePendle {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: MainchainId, config: VePendleMainchainConfig) {
        super(address, chainId, { abi: VotingEscrowPendleMainchainABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    get contract() {
        return this._contract as WrappedContract<VotingEscrowPendleMainchain>;
    }

    static createObject(chainId: MainchainId, networkConnection: NetworkConnection) {
        return new VePendleMainchain(getContractAddresses(chainId).VEPENDLE, chainId, networkConnection);
    }

    async simulateIncreaseLockPosition(
        userAddress: Address,
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params?: MulticallStaticParams
    ) {
        return this.routerStatic.multicallStatic.increaseLockPositionStatic(
            userAddress,
            additionalRawAmountToLock,
            newExpiry_s,
            params
        );
    }

    async increaseLockPosition<T extends MetaMethodType>(
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params: MetaMethodExtraParams<T> = {}
    ) {
        return this.contract.metaCall.increaseLockPosition(
            additionalRawAmountToLock,
            newExpiry_s,
            this.addExtraParams(params)
        );
    }

    async withdraw<T extends MetaMethodType = 'send'>(params: MetaMethodExtraParams<T> = {}) {
        return this.contract.metaCall.withdraw(this.addExtraParams(params));
    }
}
