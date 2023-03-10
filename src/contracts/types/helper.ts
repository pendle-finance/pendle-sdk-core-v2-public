import { Contract, ContractTransaction, providers } from 'ethers';
import { WrappedContract } from './WrappedContract';
import { GetField } from '../../common';

export type Provider = providers.Provider;
export { ORIGINAL_CONTRACT } from './WrappedContract';
export type { Signer } from 'ethers';

export type EthersContractMetaClass = 'functions' | 'callStatic' | 'estimateGas' | 'populateTransaction';
export type MetaMethodType =
    | 'send'
    | 'callStatic'
    | 'estimateGas'
    | 'meta-method'
    | 'multicallStatic'
    | 'populateTransaction'
    | 'extractParams';

export const MetaMethodTypeToEthersMetaClassMapping = {
    send: 'functions',
    callStatic: 'callStatic',
    estimateGas: 'estimateGas',
    multicallStatic: 'callStatic',
    populateTransaction: 'populateTransaction',
    extractParams: undefined,
    'meta-method': undefined,
} as const;

export type MetaMethodTypeToEthersMetaClass<T extends MetaMethodType> = NonNullable<
    (typeof MetaMethodTypeToEthersMetaClassMapping)[T]
>;

export type EthersContractMethod<
    C extends Contract,
    MetaClassOrType extends EthersContractMetaClass | MetaMethodType,
    MethodName extends ContractMethodNames<C>
> = MetaClassOrType extends EthersContractMetaClass
    ? GetField<C[MetaClassOrType], MethodName>
    : MetaClassOrType extends MetaMethodType
    ? GetField<C[MetaMethodTypeToEthersMetaClass<MetaClassOrType>], MethodName>
    : never;

export type ContractLike<T extends Contract = Contract> = T | WrappedContract<T>;

export type ContractMethodNames<C extends ContractLike> = keyof {
    [K in keyof C['callStatic'] as string extends K ? never : K]: true;
};

export type BaseCallStaticContractMethod<C extends ContractLike, MethodName extends ContractMethodNames<C>> = GetField<
    C['callStatic'],
    MethodName
> extends (...params: [...infer Body, any?]) => infer R
    ? (...params: Body) => R
    : never;

// Note that overrides are also included
export type ContractMethodParams<C extends ContractLike, MethodName extends ContractMethodNames<C>> = Parameters<
    GetField<
        C['callStatic'], // functions instead of 'callStatic' for more comprehensive 'overrides'
        MethodName
    >
>;

export type BaseCallStaticContractMethods<C extends ContractLike> = {
    [MethodName in ContractMethodNames<C>]: BaseCallStaticContractMethod<C, MethodName>;
};

export type IsViewMethodName<C extends ContractLike, MethodName extends ContractMethodNames<C>> = GetField<
    C,
    MethodName
> extends (...params: any[]) => Promise<ContractTransaction>
    ? false
    : true;

export type ViewMethodName<C extends ContractLike, MethodName extends ContractMethodNames<C>> = IsViewMethodName<
    C,
    MethodName
> extends true
    ? MethodName
    : never;
export type NonViewMethodName<C extends ContractLike, MethodName extends ContractMethodNames<C>> = IsViewMethodName<
    C,
    MethodName
> extends false
    ? MethodName
    : never;
