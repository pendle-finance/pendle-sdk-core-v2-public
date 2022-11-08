import { Contract } from 'ethers';
import { ContractLike, ORIGINAL_CONTRACT, MetaMethodType } from './types/helper';
import { WrappedContract, MetaMethodExtraParams } from './types';
import { UnionOf } from '../types';
import { mergeMulticallStaticParams } from '../entities/helper';

export function isWrapped<T extends Contract>(contract: ContractLike<T>): contract is WrappedContract<T> {
    return ORIGINAL_CONTRACT in contract;
}

export function getInnerContract<T extends Contract>(wrappedContract: ContractLike<T>): T {
    if (isWrapped(wrappedContract)) {
        return wrappedContract[ORIGINAL_CONTRACT] as T;
    }
    return wrappedContract;
}

// TODO find a less adhoc way to find the merged type
export function mergeMetaMethodExtraParams<T extends MetaMethodType, ARGS extends MetaMethodExtraParams<T>[]>(
    ...args: ARGS
): UnionOf<ARGS> {
    return args.reduce((u, v) => ({
        ...u,
        ...v,
        ...mergeMulticallStaticParams(u, v),
    })) as UnionOf<ARGS>;
}
