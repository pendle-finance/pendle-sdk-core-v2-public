import { CallOverrides } from 'ethers';
import { Multicall } from '../../multicall';
import { AddParams } from '../../common';
import { BaseCallStaticContractMethod, ContractMethodNames } from './helper';
import { Contract } from 'ethers';

/**
 * Note:
 * When the overrides has only blockTag property (that is, when Multicall.isMulticallOverrides(overrides) is true),
 * multicall is used. Otherwise callStatic is used.
 */
export type MulticallStaticParams = { multicall?: Multicall; overrides?: CallOverrides };

export type MulticallStaticMethod<C extends Contract, MethodName extends ContractMethodNames<C>> = AddParams<
    BaseCallStaticContractMethod<C, MethodName>,
    [multicallStaticParams?: MulticallStaticParams]
>;
