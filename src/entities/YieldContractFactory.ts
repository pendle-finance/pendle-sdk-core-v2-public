import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleYieldContractFactory, PendleYieldContractFactoryABI, WrappedContract } from '../contracts';
import type { Address, ChainId } from '../types';

export type YieldContractFactoryConfig = PendleEntityConfigOptionalAbi;

export class YieldContractFactory<
    C extends WrappedContract<PendleYieldContractFactory> = WrappedContract<PendleYieldContractFactory>
> extends PendleEntity<C> {
    constructor(readonly address: Address, readonly chainId: ChainId, config: YieldContractFactoryConfig) {
        super(address, chainId, { abi: PendleYieldContractFactoryABI, ...config });
    }
}
