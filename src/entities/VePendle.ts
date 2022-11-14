import {
    RouterStatic,
    VotingEscrowTokenBase,
    VotingEscrowPendleMainchain,
    VotingEscrowTokenBaseABI,
    VotingEscrowPendleMainchainABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MulticallStaticParams,
    getRouterStatic,
} from '../contracts';
import { BigNumber as BN, BigNumberish } from 'ethers';
import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { Address, getContractAddresses, ChainId, MainchainId, NetworkConnection } from '../common';

export type VePendleConfig = PendleEntityConfigOptionalAbi;

export class VePendle extends PendleEntity {
    constructor(readonly address: Address, config: VePendleConfig) {
        super(address, { abi: VotingEscrowTokenBaseABI, ...config });
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

export type VePendleMainchainConfig = VePendleConfig & {
    chainId: ChainId;
};

export class VePendleMainchain extends VePendle {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: VePendleMainchainConfig) {
        super(address, { abi: VotingEscrowPendleMainchainABI, ...config });
        this.chainId = config.chainId;
        this.routerStatic = getRouterStatic(config);
    }

    get contract() {
        return this._contract as WrappedContract<VotingEscrowPendleMainchain>;
    }

    static createObject(chainId: MainchainId, networkConnection: NetworkConnection) {
        return new VePendleMainchain(getContractAddresses(chainId).VEPENDLE, {
            chainId,
            ...networkConnection,
        });
    }

    async simulateIncreaseLockPosition(
        userAddress: Address,
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params?: MulticallStaticParams
    ): Promise<BN> {
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
