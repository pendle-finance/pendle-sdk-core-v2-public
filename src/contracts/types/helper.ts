import { Contract, providers } from 'ethers';
import { WrappedContract } from './WrappedContract';
import { GetField } from '../../types';

export { ORIGINAL_CONTRACT } from './WrappedContract';
export type { Signer } from 'ethers';

export type Provider = providers.Provider;

export type EthersContractMetaClass = 'functions' | 'callStatic' | 'estimateGas';
export type MetaMethodType = 'send' | 'callStatic' | 'estimateGas' | 'meta-method' | 'multicallStatic';

export const MetaMethodTypeToEthersMetaClassMapping = {
    send: 'functions',
    callStatic: 'callStatic',
    estimateGas: 'estimateGas',
    multicallStatic: 'callStatic',
    'meta-method': undefined,
} as const;

export type MetaMethodTypeToEthersMetaClass<T extends MetaMethodType> = NonNullable<
    typeof MetaMethodTypeToEthersMetaClassMapping[T]
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
