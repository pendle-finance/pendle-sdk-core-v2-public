import { Contract } from 'ethers';
import { ContractMethodNames, MetaMethodType, EthersContractMethod, ContractMethodParams } from './helper';
import { type ContractMetaMethod } from '../ContractMetaMethod';
import { SyncReturnType, ConcatTuple, BN, BigNumberish } from '../../common';
import { MulticallStaticParams } from './MulticallStaticMethod';

// The import is only for documentation.

export type MetaMethod<C extends Contract, MethodName extends ContractMethodNames<C>> = C[MethodName] extends (
    ...params: [...infer Head, any?]
) => any
    ? <D extends MetaMethodExtraParams<MetaMethodType> = MetaMethodExtraParams<'send'>>(
          ...metaParam:
              | ConcatTuple<Head, [metaMethodData?: D]> // for keeping the param name
              | [...MetaMethodParams<Head, C, MethodName, D>, D?] // for additional types
      ) => D extends MetaMethodExtraParams<infer T> ? MetaMethodReturnType<T, C, MethodName, D> : never
    : never;

export type MetaMethodParam<
    T,
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
> = T | ((m: ContractMetaMethod<C, MethodName, Data>) => T | Promise<T>);

export type MetaMethodParams<
    Params extends any[],
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
> = Params extends [...infer Body, infer Last]
    ? [...MetaMethodParams<Body, C, MethodName, Data>, MetaMethodParam<Last, C, MethodName, Data>]
    : [];

export type CalcBufferedGasFunction = <
    C extends Contract,
    M extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
>(
    estimatedGasUsed: BN,
    context: ContractMetaMethod<C, M, Data>
) => BigNumberish | Promise<BigNumberish>;

export type MetaMethodExtraParams<T extends MetaMethodType = 'send'> = MulticallStaticParams & {
    method?: T;
    calcBufferedGas?: CalcBufferedGasFunction;
};

/**
 * The _general_ return type of a _meta method_.
 * @remarks
 * In Pendle SDK, we have designed that the implementation of a write function
 * can also be used not only for sending transaction, but also for the other
 * method, such as `estimateGas` and `callStatic`, and may even returns some
 * useful data. But we only use one implementation, we need to determine the
 * correct return type given the input. The method is often given by the
 * type parameter `T, and it is used to compute the correct return type:
 *
 * Let `F` be the method that use this type as return type. The type parameter
 * `T` will be used to determine the return type as follows:
 *
 * - for `'send'`, `F` will execute the method of the meta-class `functions`
 * (that is, `C['functions'][MethodName]`)
 *      - if the method is a write method, the return type if
 *      `Promise<ethers.ContractTransaction>`
 *      - if the method is a read method, the return type is the same as when
 *      `T` is `'callStatic'`.
 * - for `'estimateGas'`, `F` will execute the method of the meta-class
 * `estimateGas` (that is `C['estimateGas'][MethodName]`). The return type will
 * be `Promise`<{@link BN | ethers.BigNumber}>.
 * - for `'callStatic'`, `F` will execute the method of the meta-class
 * `callStatic` (that is `C['callStatic'][MethodName]`). The return type will be
 * `Promise<R>`, that is, the same return type as `C['callStatic'][MethodName]`
 * - for `'multicallStatic'`, it will return the same thing as for
 * `'callStatic'`, but `F` will try to perform the method with {@link Multicall}
 * instead.
 * - for `meta-method`, `F` will only perform the required calculation, and
 * return `Promise`<{@link ContractMetaMethod}<C, MethodName,
 * MetaMethodExtraParams<T>>>.
 *   The `data` field of the awaited result will have the following fields:
 *     - `multicall?`: [Multicall] - the multicall instance.
 *     - `overrides?`: `ethers.CallOverrides` - the overrides. This can
 *     overridden with `params.overrides`.
 *     - `method`: The meta-method type. In this case it will be `meta-method`,
 *     the same value as `params.method`.
 *   `data` can also be extended via `Data` type parameter.
 *
 * @typeParam T - the type of the meta method. This should be infer by `tsc` to
 *      determine the correct return type.
 * @typeParam C - the contract type, used to determine the return type for
 * `'send'`, `'callStatic'`, `'multicallStatic'` and `'estimateGas'`
 * meta-method.
 * @typeParam MethodName - the contract method name of `C`.
 * @typeParam Data - the data type for `ContractMetaMethod`, in the case of
 * `T ='meta-method'`.
 */
export type MetaMethodReturnType<
    T extends MetaMethodType,
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<T>
> = Promise<
    MetaMethodType extends T // this is when TSC failed to infer T (e.g when the method is not given by the user).
        ? // In this case, TSC only knows that T is MetaMethodType.
          // So we force the default behavior to be 'send'.
          SyncReturnType<EthersContractMethod<C, 'send', MethodName>>
        : T extends 'meta-method'
        ? ContractMetaMethod<C, MethodName, Data>
        : T extends 'extractParams'
        ? ContractMethodParams<C, MethodName>
        : SyncReturnType<EthersContractMethod<C, T, MethodName>>
>;

// TODO make T extends some type for type safety nd IDE support.
export type MetaMethodData<T> = T extends (..._params: any[]) => infer R
    ? MetaMethodData<Awaited<R>>
    : T extends ContractMetaMethod<infer _C, any, infer D>
    ? D
    : never;

export function metaMethodExtraParamsIsType<T extends MetaMethodType>(
    x: MetaMethodExtraParams<MetaMethodType>,
    t: T
): x is MetaMethodExtraParams<T> {
    if (t == 'send' && x.method == undefined) return true;
    return x.method == t;
}
