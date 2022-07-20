import type { PendleYieldContractFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleYieldContractFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldContractFactory.sol/PendleYieldContractFactory.json';
import { Contract } from 'ethers';

export class YieldContractFactory {
    readonly contract: PendleYieldContractFactory;

    constructor(readonly address: Address, protected networkConnection: NetworkConnection) {
        this.contract = new Contract(
            address,
            PendleYieldContractFactoryABI,
            networkConnection.provider
        ) as PendleYieldContractFactory;
    }
}
