import { Address, ChainId } from '../common';
import { BytesLike, Contract, providers } from 'ethers';
import type { BlockTag } from '@ethersproject/abstract-provider';
import { MULTICALL_ADDRESSES_NO_GAS_LIMIT, MULTICALL_ADDRESSES_WITH_GAS_LIMIT } from './contractAddresses';
import { Multicall2Abi, PendleMulticallV1Abi } from '../contracts/abis';
import { Multicall2, PendleMulticallV1 } from '../contracts/typechainTypes';

export type Calls = {
    target: Address;
    callData: BytesLike;
};

export type Result = {
    success: boolean;
    returnData: string;
};

export interface MulticallAggregateCaller {
    tryAggregate(calls: Calls[], overrides?: { blockTag?: BlockTag }): Promise<Result[]>;
}

export class MulticallAggregateCallerNoGasLimit implements MulticallAggregateCaller {
    readonly contract: Multicall2;

    constructor(params: { chainId: ChainId; provider: providers.Provider }) {
        this.contract = new Contract(
            MULTICALL_ADDRESSES_NO_GAS_LIMIT[params.chainId],
            Multicall2Abi,
            params.provider
        ) as Multicall2;
    }

    tryAggregate(calls: Calls[], overrides?: { blockTag?: BlockTag }): Promise<Result[]> {
        return this.contract.callStatic.tryAggregate(false, calls, overrides);
    }
}

export class MulticallAggregateCallerWithGasLimit implements MulticallAggregateCaller {
    static DEFAULT_GAS_PER_CALL = 10_000_000;
    readonly contract: PendleMulticallV1;

    constructor(params: { chainId: ChainId; provider: providers.Provider }) {
        this.contract = new Contract(
            MULTICALL_ADDRESSES_WITH_GAS_LIMIT[params.chainId],
            PendleMulticallV1Abi,
            params.provider
        ) as PendleMulticallV1;
    }

    async tryAggregate(calls: Calls[], overrides?: { blockTag?: BlockTag }): Promise<Result[]> {
        if (calls.length == 0) return [];
        const gasLimitPerCall = MulticallAggregateCallerWithGasLimit.DEFAULT_GAS_PER_CALL;
        const gasLimit = gasLimitPerCall * calls.length;
        return this.contract.callStatic.tryAggregate(
            false,
            MulticallAggregateCallerWithGasLimit.DEFAULT_GAS_PER_CALL,
            calls,
            {
                ...overrides,
                gasLimit,
            }
        );
    }
}
