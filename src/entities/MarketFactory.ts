import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleMarketFactory, PendleMarketFactoryABI, WrappedContract } from '../contracts';
import { Address, ChainId } from '../common';

export type MarketFactoryConfig = PendleEntityConfigOptionalAbi;

export class MarketFactory extends PendleEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: MarketFactoryConfig) {
        super(address, chainId, { abi: PendleMarketFactoryABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleMarketFactory>;
    }
}
