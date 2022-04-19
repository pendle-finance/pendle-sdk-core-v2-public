import type { PendleMarketFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { Contract } from 'ethers';
import { dummyABI } from '../dummy';

export class MarketFactory {
    public address: Address;
    public contract: PendleMarketFactory;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleMarketFactory;
    }
}
