import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleMarketFactory, PendleMarketFactoryABI, WrappedContract } from '../contracts';
import { Address } from '../common';

export type MarketFactoryConfig = PendleEntityConfigOptionalAbi;

export class MarketFactory extends PendleEntity {
    constructor(
        readonly address: Address,
        config: MarketFactoryConfig
    ) {
        super(address, { abi: PendleMarketFactoryABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleMarketFactory>;
    }
}
