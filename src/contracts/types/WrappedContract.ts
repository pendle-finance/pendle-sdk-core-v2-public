import { Contract } from 'ethers';
import { Address, RemoveLastOptionalParam, AddOptionalParam, GetField } from '../../types';
import { Multicall } from '../../multicall';
import { ContractMethodNames, Signer, Provider } from './helper';
import { MetaMethod } from './MetaMethod';

export type WrappedContractConfig = { readonly multicall?: Multicall };

export const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');
export interface BaseWrappedContract<C extends Contract = Contract> extends WrappedContractConfig {
    address: Address;
    provider: C['provider'];
    signer: C['signer'];
    readonly interface: Omit<C['interface'], 'contractName'>;
    readonly [ORIGINAL_CONTRACT]: Contract;

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;

    readonly functions: C['functions'];
    readonly callStatic: C['callStatic'];
    readonly estimateGas: C['estimateGas'];
    readonly multicallStatic: {
        [P in ContractMethodNames<C>]: AddOptionalParam<
            RemoveLastOptionalParam<GetField<C['callStatic'], P>>,
            Multicall
        >;
    };
    readonly metaCall: { [P in ContractMethodNames<C>]: MetaMethod<C, P> };
}

export type ContractMethods<T extends Contract> = { [key in ContractMethodNames<T>]: T[key] };

export type WrappedContract<T extends Contract = Contract> = ContractMethods<T> & BaseWrappedContract<T>;
