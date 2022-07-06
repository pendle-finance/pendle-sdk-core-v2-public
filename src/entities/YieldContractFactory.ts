import type { PendleYieldContractFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleYieldContractFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldContractFactory.sol/PendleYieldContractFactory.json';
import { Contract } from 'ethers';

export class YieldContractFactory {
    address: Address;
    contract: PendleYieldContractFactory;
    chainId: number;

    protected networkConnection: NetworkConnection;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(
            _address,
            PendleYieldContractFactoryABI,
            _networkConnection.provider
        ) as PendleYieldContractFactory;
    }
}
