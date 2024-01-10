import {
    WrappedContract,
    createContractObject,
    MetaMethodExtraParams,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
} from '../contracts';
import { Address, NetworkConnection, copyNetworkConnection } from '../common';
import { Multicall } from '../multicall';
import { ContractInterface } from 'ethers';

/**
 * Base configuration type for the subclasses of `PendleEntity`.
 *
 * @remarks
 * This type is used base configuration for a `PendleEntity`, but is mainly used
 * for the subclass of `PendleEntity`, as the subclass will pass its contract
 * ABI to the class `PendleEntity`.
 *
 * Pass in `Multicall` to use contract methods with `Multicall` (via * `multicallStatic`).
 */
export type PendleEntityConfigOptionalAbi = NetworkConnection & {
    multicall?: Multicall;
    abi?: ContractInterface;
};

/**
 * This is the same type as `PendleEntityConfigOptionalAbi`, but with forced ABI.
 */
export type PendleEntityConfig = PendleEntityConfigOptionalAbi & {
    abi: ContractInterface;
};

export class PendleEntity {
    /**
     * The _wrapped_ contract that the entity is holding.
     *
     * @remarks
     * This should not be used directly. Instead, the getter `contract` should
     * be used to have the correct _type_ of the wrapped contract.
     */
    protected readonly _contract: WrappedContract;

    /**
     * The `Multicall` instance used by this entity.
     */
    readonly multicall?: Multicall;

    /**
     * The `networkConnection` of this entity.
     */
    readonly networkConnection: NetworkConnection;

    /**
     * @param address - the inner contract address
     * @param config - the entity configuration.
     */
    constructor(
        readonly address: Address,
        config: PendleEntityConfig
    ) {
        this.multicall = config.multicall;
        this.networkConnection = copyNetworkConnection(config);
        this._contract = createContractObject(address, config.abi, config);
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @remarks
     * It is intended to be overridden in the subclasses.
     * @see PendleEntity#_contract
     */
    get contract(): WrappedContract {
        return this._contract;
    }

    /**
     * @returns the set of parameters for an entity's write-method (that will do
     *      a `metaCall`). It should be overridden in the subclass.
     */
    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): MetaMethodExtraParams<T> {
        return { multicall: this.multicall };
    }

    /**
     * Merge user-defined parameters with the default parameters (from
     *      `getDefaultMetaMethodExtraParam()`) and return the result to use use in a
     *      write method.
     *
     * @typeParam T - the type of the meta method, used to determine the correct
     *      return type of the write functions.
     * @param params - the user defined parameters
     * @returns the merged parameters
     */
    addExtraParams<T extends MetaMethodType>(params: MetaMethodExtraParams<T>): MetaMethodExtraParams<T> {
        return mergeParams(this.getDefaultMetaMethodExtraParams(), params);
    }

    /**
     * The config of this entity.
     * @remarks
     * It can be used to pass as configuration for a new entity. It should be
     * overridden in the subclass.
     *
     * @typeParam T - the type of the meta method, used to determine the correct
     *      return type of the write functions.
     */
    get entityConfig(): PendleEntityConfigOptionalAbi {
        return { ...this.networkConnection, multicall: this.multicall };
    }
}

/*
 * Documentation template for read functions
 *
 * @param params - the additional parameters for read method.
 *
 */

/*
 * Documentation template for write functions
 *
 * @typeParam T - the type of the meta method. This should be infer by `tsc` to
 *      determine the correct return type. See
 *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
 *      to see the example usage with explanation.
 * @param params - the additional parameters for **write** method.
 * @returns
 *
 * When `params` is not defined, or when `params.method` is not defined, this
 * method will perform the transaction, and return
 * `Promise<ethers.ContractTransaction>`.
 *
 * Otherwise, `params.method`'s value is used to determine the return type.
 * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
 */
