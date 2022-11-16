import { PendleYieldToken, PendleYieldTokenABI, WrappedContract, MulticallStaticParams } from '../contracts';
import { Address, toAddress } from '../common';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PyEntity, PyEntityConfig } from './PyEntity';

/**
 * Configuration for a {@link YtEntity}
 */
export type YtEntityConfig = PyEntityConfig;

/**
 * This class represents a Pendle Yield token (YT token).
 */
export class YtEntity extends PyEntity {
    constructor(readonly address: Address, config: YtEntityConfig) {
        super(address, { abi: PendleYieldTokenABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendleYieldToken>;
    }

    /**
     * Get the address of the SY token, correspond to this YT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.SY(params).then(toAddress);
    }

    /**
     * Alias for {@link YtEntity#SY}
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    /**
     * Get the address of the PT token, correspond to this YT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async PT(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.PT(params).then(toAddress);
    }

    /**
     * Alias for {@link YtEntity#PT}
     */
    async pt(params?: MulticallStaticParams) {
        return this.PT(params);
    }

    /**
     * Get the entity of the SY token, correspond to this YT token.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the SY token.
     * @returns
     */
    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
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
    async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, params?.entityConfig ?? this.entityConfig);
    }

    /**
     * Get the py index, which
     * @param params - the additional parameters for read method.
     * @returns
     */
    // TODO remove multicall usage (???)
    // pyIndexCurrent is not a views function. It can affect the other multicall
    // that come after this call.
    async pyIndexCurrent(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.pyIndexCurrent(params);
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
}
