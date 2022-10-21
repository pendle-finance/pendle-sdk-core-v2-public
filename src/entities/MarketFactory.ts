import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleMarketFactory, PendleMarketFactoryABI, WrappedContract } from '../contracts';
import type { Address, ChainId } from '../types';

export type MarketFactoryConfig = PendleEntityConfigOptionalAbi;

export class MarketFactory<C extends WrappedContract<PendleMarketFactory>> extends PendleEntity<C> {
    constructor(readonly address: Address, readonly chainId: ChainId, config: MarketFactoryConfig) {
        super(address, chainId, { abi: PendleMarketFactoryABI, ...config });
    }
}
