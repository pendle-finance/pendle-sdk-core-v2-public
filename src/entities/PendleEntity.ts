import { WrappedContract, createContractObject } from '../contracts';

import { ContractInterface } from 'ethers';
import { NetworkConnection, Address, ChainId } from '../types';
import { Multicall } from '../multicall';
import { copyNetworkConnection } from './helper';

export type PendleEntityConfigOptionalAbi = NetworkConnection & {
    multicall?: Multicall;
    abi?: ContractInterface;
};

export type PendleEntityConfig = PendleEntityConfigOptionalAbi & {
    abi: ContractInterface;
};

export class PendleEntity<C extends WrappedContract> {
    readonly contract: C;
    readonly multicall?: Multicall;
    readonly networkConnection: NetworkConnection;

    constructor(readonly address: Address, readonly chainId: ChainId, config: PendleEntityConfig) {
        this.multicall = config.multicall;
        this.networkConnection = copyNetworkConnection(config);
        this.contract = createContractObject(address, config.abi, config) as C;
    }
}
