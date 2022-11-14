import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleYieldContractFactory, PendleYieldContractFactoryABI, WrappedContract } from '../contracts';
import type { Address } from '../common';

export type YieldContractFactoryConfig = PendleEntityConfigOptionalAbi;

export class YieldContractFactory extends PendleEntity {
    constructor(readonly address: Address, config: YieldContractFactoryConfig) {
        super(address, { abi: PendleYieldContractFactoryABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleYieldContractFactory>;
    }
}
