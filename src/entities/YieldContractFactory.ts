import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleYieldContractFactory, PendleYieldContractFactoryABI, WrappedContract } from '../contracts';
import type { Address, ChainId } from '../common';

export type YieldContractFactoryConfig = PendleEntityConfigOptionalAbi;

export class YieldContractFactory extends PendleEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: YieldContractFactoryConfig) {
        super(address, chainId, { abi: PendleYieldContractFactoryABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleYieldContractFactory>;
    }
}
