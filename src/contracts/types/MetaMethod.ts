import { Contract } from 'ethers';
import { ContractMethodNames, MetaMethodType, EthersContractMethod } from './helper';
import { ContractMetaMethod } from '../ContractMetaMethod';
import { SyncReturnType, ConcatTuple, MulticallStaticParams } from '../../types';

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

export type MetaMethodExtraParams<T extends MetaMethodType = 'send'> = MulticallStaticParams & {
    method?: T;
};

export type MetaMethodReturnType<
    T extends MetaMethodType,
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<T>
> = Promise<
    MetaMethodType extends T
        ? SyncReturnType<EthersContractMethod<C, 'send', MethodName>>
        : T extends 'meta-method'
        ? ContractMetaMethod<C, MethodName, Data>
        : SyncReturnType<EthersContractMethod<C, T, MethodName>>
>;

// TODO make T extends some type for type safety nd IDE support.
export type MetaMethodData<T> = T extends (..._params: any[]) => infer R
    ? MetaMethodData<Awaited<R>>
    : T extends ContractMetaMethod<infer _C, any, infer D>
    ? D
    : never;
