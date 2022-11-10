import { PendleYieldToken, PendleYieldTokenABI, WrappedContract, MulticallStaticParams } from '../contracts';
import { Address, toAddress, ChainId } from '../common';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PyEntity, PyEntityConfig } from './PyEntity';

export type YtEntityConfig = PyEntityConfig;

export class YtEntity extends PyEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: YtEntityConfig) {
        super(address, chainId, { abi: PendleYieldTokenABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleYieldToken>;
    }

    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.SY(params).then(toAddress);
    }

    /**
     * Alias for YT#SY
     * @see YtEntity#SY
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    async PT(params?: MulticallStaticParams): Promise<Address> {
        return this.contract.multicallStatic.PT(params).then(toAddress);
    }

    /**
     * Alias for YT#PT
     * @see YtEntity#PT
     */
    async pt(params?: MulticallStaticParams) {
        return this.PT(params);
    }

    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async pyIndexCurrent(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.pyIndexCurrent(params);
    }

    async getRewardTokens(params?: MulticallStaticParams): Promise<Address[]> {
        const results = await this.contract.multicallStatic.getRewardTokens(params);
        return results.map(toAddress);
    }
}
