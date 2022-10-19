import type { PendleYieldContractFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as PendleYieldContractFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/YieldContracts/PendleYieldContractFactory.sol/PendleYieldContractFactory.json';
import { createContractObject, WrappedContract } from '../contractHelper';

export class YieldContractFactory {
    readonly contract: WrappedContract<PendleYieldContractFactory>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.contract = createContractObject<PendleYieldContractFactory>(
            address,
            PendleYieldContractFactoryABI,
            networkConnection
        );
    }
}
