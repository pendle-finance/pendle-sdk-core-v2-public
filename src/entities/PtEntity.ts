import { PendlePrincipalToken, PendlePrincipalTokenABI, WrappedContract, MulticallStaticParams } from '../contracts';
import { YtEntity, YtEntityConfig } from './YtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PyEntity, PyEntityConfig } from './PyEntity';
import { Address, toAddress, ChainId } from '../common';

export type PtEntityConfig = PyEntityConfig;

export class PtEntity extends PyEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: PtEntityConfig) {
        super(address, chainId, { abi: PendlePrincipalTokenABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendlePrincipalToken>;
    }

    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.SY(params).then(toAddress);
    }

    /**
     * Alias for PT#SY
     * @see PtEntity#SY
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    async YT(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.YT(params).then(toAddress);
    }

    /**
     * Alias for PT#YT
     * @see PtEntity#YT
     */
    async yt(params?: MulticallStaticParams) {
        return this.YT(params);
    }

    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async ytEntity(params?: MulticallStaticParams & { entityConfig?: YtEntityConfig }) {
        const ytAddr = await this.YT(params);
        return new YtEntity(ytAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }
}
