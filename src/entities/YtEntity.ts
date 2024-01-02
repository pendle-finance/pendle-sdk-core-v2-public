import {
    PendleYieldTokenV2,
    PendleYieldTokenV2ABI,
    WrappedContract,
    MulticallStaticParams,
    MetaMethodExtraParams,
    MetaMethodType,
    MetaMethodReturnType,
} from '../contracts';
import { Address, toAddress, BigNumberish, BN } from '../common';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PyEntity, PyEntityConfig } from './PyEntity';
import * as offchainMath from '@pendle/core-v2-offchain-math';

/**
 * Configuration for a {@link YtEntity}
 */
export type YtEntityConfig = PyEntityConfig;

/**
 * This class represents a Pendle Yield token (YT token).
 */
export class YtEntity extends PyEntity {
    constructor(readonly address: Address, config: YtEntityConfig) {
        super(address, { abi: PendleYieldTokenV2ABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendleYieldTokenV2>;
    }

    /**
     * Get the address of the SY token, correspond to this YT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    override async SY(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.SY(params).then(toAddress);
    }

    /**
     * Get the address of the PT token, correspond to this YT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    override async PT(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.PT(params).then(toAddress);
    }

    /**
     * Return `this` address.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    override YT(_params?: MulticallStaticParams): Promise<Address> {
        return Promise.resolve(this.address);
    }

    /**
     * Get the entity of the SY token, correspond to this YT token.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the SY token.
     * @returns
     */
    override async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, params?.entityConfig ?? this.entityConfig);
    }

    /**
     * Get the entity of the PT token, correspond to this YT token.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the SY token.
     * @returns
     */
    override async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, params?.entityConfig ?? this.entityConfig);
    }

    override ytEntity(params?: MulticallStaticParams & { entityConfig?: YtEntityConfig }) {
        const res = params?.entityConfig ? new YtEntity(this.address, params.entityConfig) : this;
        return Promise.resolve(res);
    }

    /**
     * Get the py index, which
     * @param params - the additional parameters for read method.
     * @returns
     */
    // TODO remove multicall usage (???)
    // pyIndexCurrent is not a views function. It can affect the other multicall
    // that come after this call.
    async pyIndexCurrent(params?: MulticallStaticParams): Promise<offchainMath.PyIndex> {
        const rawPyIndex = await this.contract.multicallStatic.pyIndexCurrent(params);
        return offchainMath.PyIndex.create(rawPyIndex.toBigInt());
    }

    /**
     * Get the list addresses of the reward tokens, corresponding to this YT token.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getRewardTokens(params?: MulticallStaticParams): Promise<Address[]> {
        const results = await this.contract.multicallStatic.getRewardTokens(params);
        return results.map(toAddress);
    }

    async previewMintPyFromSy(netSyIn: BigNumberish, params?: MulticallStaticParams): Promise<BN> {
        const pyIndex = await this.pyIndexCurrent(params);
        const netPYMinted = pyIndex.convert({ sy: BN.from(netSyIn).toBigInt() }).asset;
        return BN.from(netPYMinted);
    }

    async previewRedeemPyToSy(netPYIn: BigNumberish, params?: MulticallStaticParams): Promise<BN> {
        const pyIndex = await this.pyIndexCurrent(params);
        const netSyOut = pyIndex.convert({ asset: BN.from(netPYIn).toBigInt() }).sy;
        return BN.from(netSyOut);
    }

    async redeemDueInterestAndRewards<T extends MetaMethodType>(
        userAddress: Address,
        params?: MetaMethodExtraParams<T> & {
            redeemInterest?: boolean;
            redeemRewards?: boolean;
        }
    ): MetaMethodReturnType<T, PendleYieldTokenV2, 'redeemDueInterestAndRewards', object> {
        return this.contract.metaCall.redeemDueInterestAndRewards(
            userAddress,
            params?.redeemInterest ?? false,
            params?.redeemInterest ?? false,
            params
        );
    }

    async getExpiry(params?: MulticallStaticParams): Promise<Date> {
        const expiryBN = await this.contract.multicallStatic.expiry(params);
        return new Date(expiryBN.mul(1000).toNumber());
    }

    async isExpired(params?: MulticallStaticParams): Promise<boolean> {
        return this.contract.multicallStatic.isExpired(params);
    }
}
