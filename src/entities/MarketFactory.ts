import type { PendleMarketFactory } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as PendleMarketFactoryABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarketFactory.sol/PendleMarketFactory.json';
import { createContractObject, ContractLike } from '../contractHelper';

export class MarketFactory {
    readonly contract: ContractLike<PendleMarketFactory>;
    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.contract = createContractObject<PendleMarketFactory>(address, PendleMarketFactoryABI, networkConnection);
    }
}
