import { Contract } from 'ethers';
import { ContractLike, ORIGINAL_CONTRACT, MetaMethodType } from './types/helper';
import { WrappedContract, MetaMethodExtraParams } from './types';
import { UnionOf } from '../types';

export function isWrapped<T extends Contract>(contract: ContractLike<T>): contract is WrappedContract<T> {
    return ORIGINAL_CONTRACT in contract;
}

export function getInnerContract<T extends Contract>(wrappedContract: ContractLike<T>): T {
    if (isWrapped(wrappedContract)) {
        return wrappedContract[ORIGINAL_CONTRACT] as T;
    }
    return wrappedContract;
}

export function mergeMetaMethodExtraParams<T extends MetaMethodType, ARGS extends MetaMethodExtraParams<T>[]>(
    ...args: ARGS
): UnionOf<ARGS> {
    return args.reduce((u, v) => ({
        ...u,
        ...v,
        overrides: {
            ...u?.overrides,
            ...v?.overrides,
        },
    })) as UnionOf<ARGS>;
}
