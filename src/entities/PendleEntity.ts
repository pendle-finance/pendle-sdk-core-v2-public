import {
    WrappedContract,
    createContractObject,
    MetaMethodExtraParams,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
} from '../contracts';

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

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): MetaMethodExtraParams<T> {
        return { multicall: this.multicall };
    }

    addExtraParams<T extends MetaMethodType>(params: MetaMethodExtraParams<T>): MetaMethodExtraParams<T> {
        return mergeParams(this.getDefaultMetaMethodExtraParams(), params);
    }
}
