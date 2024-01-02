import {
    VotingEscrowTokenBase,
    VotingEscrowPendleMainchain,
    VotingEscrowTokenBaseABI,
    VotingEscrowPendleMainchainABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MulticallStaticParams,
    ContractMethodNames,
    MetaMethodReturnType,
    ContractMetaMethod,
} from '../contracts';
import { BigNumber as BN, BigNumberish } from 'ethers';
import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { Address, getContractAddresses, ChainId, MainchainId, NetworkConnection, calcSlippedUpAmount } from '../common';
import * as errors from '../errors';
import * as offchainMath from '@pendle/core-v2-offchain-math';

/**
 * Configuration for {@link VePendle}
 */
export type VePendleConfig = PendleEntityConfigOptionalAbi;

export class VePendle extends PendleEntity {
    static readonly ONE_DAY_s = 24 * 60 * 60;
    static readonly ONE_WEEK_s = 7 * VePendle.ONE_DAY_s;
    static readonly MAX_LOCK_TIME_s = 104 * VePendle.ONE_WEEK_s;
    static readonly MIN_LOCK_TIME_s = VePendle.ONE_WEEK_s;

    constructor(readonly address: Address, config: VePendleConfig) {
        super(address, { abi: VotingEscrowTokenBaseABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @remarks
     * It is intended to be overridden in the subclasses.
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<VotingEscrowTokenBase>;
    }

    /**
     * Get the balance of an user, given the account
     * @param userAddress - the account address of the user
     * @param params - the additional parameters for read method.
     * @returns the balance of the user
     */
    async balanceOf(userAddress: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.balanceOf(userAddress, params);
    }

    /**
     * Get the user lock position.
     * @param userAddress - the address of the user.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async positionData(userAddress: Address, params?: MulticallStaticParams) {
        return this.contract.multicallStatic.positionData(userAddress, params);
    }

    /**
     * Get the current total supply of this VePendle token
     * @param params - the additional parameters for read method.
     * @returns
     */
    // TODO remove multicall usage (???)
    async totalSupplyCurrent(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.totalSupplyStored(params);
    }

    static isValidWTime(timestamp_s: BigNumberish): boolean {
        return BN.from(timestamp_s).mod(VePendle.ONE_WEEK_s).isZero();
    }
}

export type VePendleMainchainMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<VotingEscrowPendleMainchain>,
    ExtraData extends object = object
> = MetaMethodReturnType<T, VotingEscrowPendleMainchain, MethodName, ExtraData & MetaMethodExtraParams<T>>;

/**
 * The configuration for {@link VePendleMainchain}
 */
export type VePendleMainchainConfig = VePendleConfig & {
    chainId: ChainId;
};

export class VePendleMainchain extends VePendle {
    static BROADCAST_FEE_BUFFER = 0.02; // 2%
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: VePendleMainchainConfig) {
        super(address, { abi: VotingEscrowPendleMainchainABI, ...config });
        this.chainId = config.chainId;
    }

    get entityConfig(): VePendleMainchainConfig {
        return { ...super.entityConfig, chainId: this.chainId };
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<VotingEscrowPendleMainchain>;
    }

    /**
     * Create a {@link VePendleMainchain} object for a given the chainId.
     * @param chainId
     * @param networkConnection
     * @returns
     */
    static createObject(chainId: MainchainId, networkConnection: NetworkConnection) {
        return new VePendleMainchain(getContractAddresses(chainId).VEPENDLE, {
            chainId,
            ...networkConnection,
        });
    }

    /**
     * Simulate increase lock position
     * @param userAddress
     * @param additionalRawAmountToLock
     * @param newExpiry_s
     * @param params - the additional parameters for read method.
     * @returns
     */
    async simulateIncreaseLockPosition(
        userAddress: Address,
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params?: MulticallStaticParams
    ): Promise<BN> {
        // TODO add custom errors
        newExpiry_s = BN.from(newExpiry_s);
        if (!VePendle.isValidWTime(newExpiry_s)) throw new errors.PendleSdkError('InvalidWTime');

        const [oldPosition, blockData] = await Promise.all([
            this.contract.multicallStatic.positionData(userAddress, params),
            this.contract.provider.getBlock(params?.overrides?.blockTag ?? 'latest'),
        ]);
        const blockTime = BN.from(blockData.timestamp);

        if (newExpiry_s.lt(blockTime)) throw new errors.PendleSdkError('ExpiryInThePast');
        if (newExpiry_s.gt(blockTime.add(VePendle.MAX_LOCK_TIME_s)))
            throw new errors.PendleSdkError('VEExceededMaxLockTime');
        if (newExpiry_s.lt(blockTime.add(VePendle.MIN_LOCK_TIME_s)))
            throw new errors.PendleSdkError('VEInsufficientLockTime');

        if (newExpiry_s.lt(oldPosition.expiry)) throw new errors.PendleSdkError('VENotAllowedReduceExpiry');
        const newTotalAmountLocked = oldPosition.amount.add(additionalRawAmountToLock);
        if (newTotalAmountLocked.lte(0)) throw new errors.PendleSdkError('VEZeroAmountLocked');

        const veBalance = offchainMath.VeBalance.fromLockedPosition({
            expiryTimestamp_s: newExpiry_s.toBigInt(),
            lockedPendleRawAmount: newTotalAmountLocked.toBigInt(),
        });

        return BN.from(veBalance.getValueAt(blockTime.toBigInt()));
    }

    async increaseLockPosition<T extends MetaMethodType>(
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params?: MetaMethodExtraParams<T> & {
            broadcastChainIds?: [];
        }
    ): VePendleMainchainMetaMethodReturnType<T, 'increaseLockPosition'>;

    async increaseLockPosition<T extends MetaMethodType>(
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params: MetaMethodExtraParams<T> & {
            broadcastChainIds: ChainId[];
        }
    ): VePendleMainchainMetaMethodReturnType<T, 'increaseLockPositionAndBroadcast'>;

    /**
     * Increase Lock position.
     *
     * @remarks
     * The `sender` will be the one who has his lock position increased.
     *
     * If params.broadcastChainIds are specified and **non-empty**, the
     * contract function `increaseLockPositionAndBroadcast` is called,
     * otherwise `increaseLockPosition` is called instead. Note that this also
     * affects the return type of the function, but the difference is minimal.
     *
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param additionalRawAmountToLock
     * @param newExpiry_s
     * @param params - the additional parameters for **write** method.
     * @param params.broadcastChainIds - if specify and **non-empty**, the lock
     *      position will be broadcasted to the other chain, the ID of which are
     *      specified by the parameter.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async increaseLockPosition<T extends MetaMethodType>(
        additionalRawAmountToLock: BigNumberish,
        newExpiry_s: BigNumberish,
        params: MetaMethodExtraParams<T> & {
            broadcastChainIds?: ChainId[];
        } = {}
    ): VePendleMainchainMetaMethodReturnType<T, 'increaseLockPosition' | 'increaseLockPositionAndBroadcast'> {
        if (params.broadcastChainIds != undefined && params.broadcastChainIds.length > 0) {
            const chainIdBNs = params.broadcastChainIds.map((chainId) => BN.from(chainId));
            const broadcastFee = await this.contract.multicallStatic.getBroadcastPositionFee(chainIdBNs);
            if (!params.overrides) params.overrides = {};
            params.overrides.value =
                params.overrides.value ?? calcSlippedUpAmount(broadcastFee, VePendleMainchain.BROADCAST_FEE_BUFFER);

            return this.contract.metaCall.increaseLockPositionAndBroadcast(
                additionalRawAmountToLock,
                newExpiry_s,
                chainIdBNs,
                this.addExtraParams(params)
            );
        }
        return this.contract.metaCall.increaseLockPosition(
            additionalRawAmountToLock,
            newExpiry_s,
            this.addExtraParams(params)
        );
    }

    async broadcastUserPosition<T extends MetaMethodType>(
        chainIds: ChainId[],
        params: MetaMethodExtraParams<T> & {
            userAddress?: Address;
        } = {}
    ): VePendleMainchainMetaMethodReturnType<T, 'broadcastUserPosition'> {
        const chainIdBNs = chainIds.map((chainId) => BN.from(chainId));
        const broadcastFee = await this.contract.multicallStatic.getBroadcastPositionFee(chainIdBNs);

        if (!params.overrides) params.overrides = {};
        params.overrides.value =
            params.overrides.value ?? calcSlippedUpAmount(broadcastFee, VePendleMainchain.BROADCAST_FEE_BUFFER);

        return this.contract.metaCall.broadcastUserPosition(
            params.userAddress ?? ContractMetaMethod.utils.getContractSignerAddress,
            chainIdBNs,
            this.addExtraParams(params)
        );
    }

    async broadcastTotalSupply<T extends MetaMethodType>(
        chainIds: ChainId[],
        params: MetaMethodExtraParams<T>
    ): VePendleMainchainMetaMethodReturnType<T, 'broadcastTotalSupply'> {
        return this.contract.metaCall.broadcastTotalSupply(
            chainIds.map((value) => BN.from(value)),
            this.addExtraParams(params)
        );
    }

    /**
     * Withdraw an expired lock position, get back all locked PENDLE
     * @remarks
     * The user that receives the locked PENDLED is the `sender`.
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param params - the additional parameters for **write** method.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async withdraw<T extends MetaMethodType>(
        params: MetaMethodExtraParams<T> = {}
    ): VePendleMainchainMetaMethodReturnType<T, 'withdraw'> {
        return this.contract.metaCall.withdraw(this.addExtraParams(params));
    }
}
