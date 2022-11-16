import { PendlePrincipalToken, PendlePrincipalTokenABI, WrappedContract, MulticallStaticParams } from '../contracts';
import { YtEntity, YtEntityConfig } from './YtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PyEntity, PyEntityConfig } from './PyEntity';
import { Address, toAddress } from '../common';

/**
 * Configuration for a {@link PtEntity}
 */
export type PtEntityConfig = PyEntityConfig;

/**
 * This class represents a Pendle Principle token (PT token).
 */
export class PtEntity extends PyEntity {
    constructor(readonly address: Address, config: PtEntityConfig) {
        super(address, { abi: PendlePrincipalTokenABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendlePrincipalToken>;
    }

    /**
     * Get the address of the SY token, correspond to this PT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.SY(params).then(toAddress);
    }

    /**
     * Alias for {@link PtEntity#SY}
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    /**
     * Get the address of the YT token, correspond to this PT token.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async YT(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.YT(params).then(toAddress);
    }

    /**
     * Alias for {@link PtEntity#YT}
     */
    async yt(params?: MulticallStaticParams) {
        return this.YT(params);
    }

    /**
     * Get the entity of the SY token, correspond to this PT token.
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
     * Get the entity of the YT token, correspond to this PT token.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the YT token.
     * @returns
     */
    async ytEntity(params?: MulticallStaticParams & { entityConfig?: YtEntityConfig }) {
        const ytAddr = await this.YT(params);
        return new YtEntity(ytAddr, params?.entityConfig ?? this.entityConfig);
    }
}
