import { Contract, CallOverrides } from 'ethers';
import { Multicall } from '../../multicall';
import { ContractMethodNames, MetaMethodType, EthersContractMethod } from './helper';
import { ContractMetaMethod } from '../ContractMetaMethod';
import { SyncReturnType } from '../../types';

export type MetaMethod<C extends Contract, MethodName extends ContractMethodNames<C>> = C[MethodName] extends (
    ...params: [...infer Head, any?]
) => any
    ? <D extends MetaMethodExtraParams<MetaMethodType> = MetaMethodExtraParams<'send'>>(
          ...params: [...MetaMethodParams<Head, C, MethodName, D>, D?]
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

export type MetaMethodExtraParams<T extends MetaMethodType = 'send'> = {
    method?: T;
    overrides?: CallOverrides;
    multicall?: Multicall;
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
