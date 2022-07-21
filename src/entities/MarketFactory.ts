import type { PendleMarketFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleMarketFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarketFactory.sol/PendleMarketFactory.json';
import { Contract } from 'ethers';

export class MarketFactory {
    readonly contract: PendleMarketFactory;
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.contract = new Contract(
            address,
            PendleMarketFactoryABI,
            networkConnection.provider
        ) as PendleMarketFactory;
    }
}
