import type { PendleMarketFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleMarketFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarketFactory.sol/PendleMarketFactory.json';
import { Contract } from 'ethers';

export class MarketFactory {
    address: Address;
    contract: PendleMarketFactory;
    chainId: number;

    protected networkConnection: NetworkConnection;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(
            _address,
            PendleMarketFactoryABI,
            _networkConnection.provider
        ) as PendleMarketFactory;
    }
}
