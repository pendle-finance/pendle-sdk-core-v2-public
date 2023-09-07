import { Address, ChainId } from '../common';
import { BytesLike, Contract, providers } from 'ethers';
import type { BlockTag } from '@ethersproject/abstract-provider';
import {
    MULTICALL_ADDRESSES_NO_GAS_LIMIT,
    MULTICALL_ADDRESSES_WITH_GAS_LIMIT,
    PendleMulticallSupportedChain,
} from './contractAddresses';
import { Multicall2Abi, PendleMulticallV2Abi } from '../contracts/abis';
import { Multicall2, PendleMulticallV2 } from '../contracts/typechainTypes';
import { ErrorFragment, Interface } from 'ethers/lib/utils';

export type Calls = {
    target: Address;
    callData: BytesLike;
};

export type Result = {
    success: boolean;
    returnData: string;
};

const TRANSFORMER = new Interface([]);
const MULTICALLV2_ERROR_FRAGMENT = ErrorFragment.from('CallThenRevertError(bool success, bytes res)');

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
    readonly contract: PendleMulticallV2;

    constructor(address: Address, provider: providers.Provider) {
        this.contract = new Contract(address, PendleMulticallV2Abi, provider) as PendleMulticallV2;
    }

    static isSupportedChain(chainId: ChainId): chainId is PendleMulticallSupportedChain {
        return chainId in MULTICALL_ADDRESSES_WITH_GAS_LIMIT;
    }

    static createInstance(params: { chainId: PendleMulticallSupportedChain; provider: providers.Provider }) {
        return new MulticallAggregateCallerWithGasLimit(
            MULTICALL_ADDRESSES_WITH_GAS_LIMIT[params.chainId],
            params.provider
        );
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

export class MulticallV2AggregateCallerWithGasLimit extends MulticallAggregateCallerWithGasLimit {
    static createInstance(params: { chainId: PendleMulticallSupportedChain; provider: providers.Provider }) {
        return new MulticallV2AggregateCallerWithGasLimit(
            MULTICALL_ADDRESSES_WITH_GAS_LIMIT[params.chainId],
            params.provider
        );
    }

    async tryAggregate(calls: Calls[], overrides?: { blockTag?: BlockTag }): Promise<Result[]> {
        if (calls.length == 0) return [];
        const gasLimitPerCall = MulticallV2AggregateCallerWithGasLimit.DEFAULT_GAS_PER_CALL;
        const gasLimit = gasLimitPerCall * calls.length;
        const callResults = await this.contract.callStatic.tryAggregateRevert(gasLimitPerCall, calls, {
            ...overrides,
            gasLimit,
        });

        return callResults.map((result) => {
            const { success, res } = TRANSFORMER.decodeErrorResult(MULTICALLV2_ERROR_FRAGMENT, result);
            return { success, returnData: res };
        });
    }
}
