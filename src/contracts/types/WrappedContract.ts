import { Contract } from 'ethers';
import { FunctionFragment } from '@ethersproject/abi';
import { Multicall } from '../../multicall';
import { ContractMethodNames, Signer, Provider } from './helper';
import { MetaMethod } from './MetaMethod';
import { MulticallStaticMethod } from './MulticallStaticMethod';
import { Address } from '../../common';

export type WrappedContractConfig = { readonly multicall?: Multicall };

export const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');
export interface BaseWrappedContract<C extends Contract = Contract> extends WrappedContractConfig {
    address: Address;
    provider: C['provider'];
    signer: C['signer'];
    readonly interface: Omit<C['interface'], 'contractName'>;
    readonly [ORIGINAL_CONTRACT]: Contract;

    functionFragmentsMapping: Record<ContractMethodNames<C>, FunctionFragment>;

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;

    readonly functions: C['functions'];
    readonly populateTransaction: C['populateTransaction'];
    readonly callStatic: C['callStatic'];
    readonly estimateGas: C['estimateGas'];
    readonly filters: C['filters'];
    readonly queryFilter: C['queryFilter'];

    // Use the following to prevent write methods having multicall ability
    // readonly multicallStatic: { [P in ContractMethodNames<C> as ViewMethodName<C>]: MulticallStaticMethod<C, P> };
    readonly multicallStatic: { [P in ContractMethodNames<C>]: MulticallStaticMethod<C, P> };

    readonly metaCall: { [P in ContractMethodNames<C>]: MetaMethod<C, P> };
}

export type ContractMethods<T extends Contract> = { [key in ContractMethodNames<T>]: T[key] };

export type WrappedContract<T extends Contract = Contract> = ContractMethods<T> & BaseWrappedContract<T>;
