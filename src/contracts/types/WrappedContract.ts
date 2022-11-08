import { Contract } from 'ethers';
import { FunctionFragment } from '@ethersproject/abi';
import { Address, AddParams, MulticallStaticParams } from '../../types';
import { Multicall } from '../../multicall';
import { ContractMethodNames, Signer, Provider, BaseCallStaticContractMethod } from './helper';
import { MetaMethod } from './MetaMethod';

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
    readonly callStatic: C['callStatic'];
    readonly estimateGas: C['estimateGas'];
    readonly filters: C['filters'];
    readonly queryFilter: C['queryFilter'];

    /**
     * Note:
     * When the overrides has only blockTag property (that is, when Multicall.isMulticallOverrides(overrides) is true),
     * multicall is used. Otherwise callStatic is used.
     */
    readonly multicallStatic: {
        // Use the following to prevent write methods having multicall ability
        // [P in ContractMethodNames<C> as ViewMethodName<C, P>]: AddParams<
        [P in ContractMethodNames<C>]: AddParams<
            BaseCallStaticContractMethod<C, P>,
            [multicallStaticParams?: MulticallStaticParams]
        >;
    };
    readonly metaCall: { [P in ContractMethodNames<C>]: MetaMethod<C, P> };
}

export type ContractMethods<T extends Contract> = { [key in ContractMethodNames<T>]: T[key] };

export type WrappedContract<T extends Contract = Contract> = ContractMethods<T> & BaseWrappedContract<T>;
