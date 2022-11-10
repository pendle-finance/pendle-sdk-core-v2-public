import {
    WrappedContract,
    createContractObject,
    MetaMethodExtraParams,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
} from '../contracts';
import { Address, NetworkConnection, copyNetworkConnection, ChainId } from '../common';
import { Multicall } from '../multicall';
import { ContractInterface } from 'ethers';

export type PendleEntityConfigOptionalAbi = NetworkConnection & {
    multicall?: Multicall;
    abi?: ContractInterface;
};

export type PendleEntityConfig = PendleEntityConfigOptionalAbi & {
    abi: ContractInterface;
};

export class PendleEntity {
    protected readonly _contract: WrappedContract;
    readonly multicall?: Multicall;
    readonly networkConnection: NetworkConnection;

    constructor(readonly address: Address, readonly chainId: ChainId, config: PendleEntityConfig) {
        this.multicall = config.multicall;
        this.networkConnection = copyNetworkConnection(config);
        this._contract = createContractObject(address, config.abi, config);
    }

    get contract(): WrappedContract {
        return this._contract;
    }

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): MetaMethodExtraParams<T> {
        return { multicall: this.multicall };
    }

    addExtraParams<T extends MetaMethodType>(params: MetaMethodExtraParams<T>): MetaMethodExtraParams<T> {
        return mergeParams(this.getDefaultMetaMethodExtraParams(), params);
    }

    get entityConfig(): PendleEntityConfigOptionalAbi {
        return { ...this.networkConnection, multicall: this.multicall };
    }
}
