import type { BlockTag } from '@ethersproject/abstract-provider';
import type { Provider } from '@ethersproject/providers';
import { Contract, CallOverrides } from 'ethers';
import { FunctionFragment, Interface } from 'ethers/lib/utils';
import { PendleSdkError } from '../errors';
import { Address, toAddress, ChainId, RemoveLastOptionalParam, AddParams } from '../common';
import * as batcher from '../common/Batcher';
import { ContractLike } from '../contracts/types';
import {
    MulticallAggregateCaller,
    MulticallAggregateCallerNoGasLimit,
    MulticallAggregateCallerWithGasLimit,
    MulticallV2AggregateCallerWithGasLimit,
} from './MulticallAggregateCaller';
import * as iters from 'itertools';
import { MulticallError } from './errors';

/**
 * Multicall implementation, allowing to call function of contract.callStatic functions
 * using multicall with Promise (without overrides).
 *
 * Example usage:
 *     const multicall = new Multicall({
 *          chainId,
 *          provider,
 *     });
 *     const contract = new Contract(address, PendleERC20ABI, networkConnection.provider) as PendleERC20;
 *
 *     // very small interface changes
 *     const balance = await multicall.wrap(contract).callStatic.balanceOf(userAddress);
 *
 *     // multiple calls
 *     const users = [addr1, addr2, addr3];
 *     const balances = await Promise.all(user.map((addr) => multicall.wrap(contract).callStatic.balanceOf(addr)));
 *
 * ### Result caching
 * Multicall#wrap will cache the result right in the contract object. To access the cache result without
 * calling the wrap function, use
 *
 *      contract[multicall.multicallStaticSymbol]
 *
 * Note that the field `multicallStaticSymbol` is **not** static, but local to the multicall instance.
 */

const TRANSFORMER = new Interface([]);
export const DEFAULT_CALL_LIMIT = 64;

class ContractCall {
    fragment: FunctionFragment;
    address: Address;
    params: unknown[];

    constructor({ fragment, address, params }: { fragment: FunctionFragment; address: Address; params: unknown[] }) {
        this.fragment = fragment;
        this.address = address;
        this.params = params;
    }
}

export type MulticallOverrides = {
    blockTag?: BlockTag | Promise<BlockTag>;
};

export type MulticallStatic<T extends Pick<Contract, 'callStatic'>> = {
    callStatic: {
        [P in keyof T['callStatic']]: AddParams<
            RemoveLastOptionalParam<T['callStatic'][P]>,
            [multicallOverrides?: MulticallOverrides]
        >;
    };
};

export class Multicall {
    static isMulticallOverrides(overrides?: CallOverrides): overrides is MulticallOverrides | undefined {
        if (overrides === undefined) {
            return true;
        }
        for (const key of Object.keys(overrides)) {
            if (key !== 'blockTag' && (overrides as any)[key] != undefined) {
                return false;
            }
        }
        return true;
    }

    readonly batchMap = new Map<BlockTag, MulticallBatch>();
    public readonly cacheWrappedContract = new WeakMap<ContractLike, MulticallStatic<Contract>>();
    constructor(
        readonly callLimit: number,
        private multicallAggregateCaller: MulticallAggregateCaller
    ) {}

    static create(params: {
        chainId: ChainId;
        provider: Provider;
        callLimit?: number;
        withGasLimit?: boolean;
        usePendleMulticallV2?: boolean;
    }): Multicall {
        const {
            callLimit = DEFAULT_CALL_LIMIT,
            withGasLimit = true,
            chainId,
            provider,
            usePendleMulticallV2 = true,
        } = params;
        let multicallAggregateCaller: MulticallAggregateCaller;

        const AggregateCallerGasLimitClass = usePendleMulticallV2
            ? MulticallV2AggregateCallerWithGasLimit
            : MulticallAggregateCallerWithGasLimit;
        if (withGasLimit && AggregateCallerGasLimitClass.isSupportedChain(chainId)) {
            multicallAggregateCaller = AggregateCallerGasLimitClass.createInstance({
                chainId,
                provider,
            });
        } else {
            if (withGasLimit) {
                // eslint-disable-next-line no-console
                console.info(`Multicall with gas limit is not supported on chain ${chainId}. Fallback to Multicall3`);
            }
            multicallAggregateCaller = new MulticallAggregateCallerNoGasLimit({ chainId, provider });
        }
        return new Multicall(callLimit, multicallAggregateCaller);
    }

    async doAggregateCalls(
        calls: readonly ContractCall[],
        blockTag: BlockTag
    ): Promise<batcher.BatchExecutionResult[]> {
        const callRequests = iters.map(calls, (call) => ({
            target: call.address,
            callData: TRANSFORMER.encodeFunctionData(call.fragment, call.params),
        }));

        const responses = await Promise.all(
            iters.map(iters.chunked(callRequests, this.callLimit), async (chunkedCallRequests) =>
                this.multicallAggregateCaller.tryAggregate(chunkedCallRequests, { blockTag })
            )
        ).then((res) => res.flat());

        const result = iters.map(
            iters.zip3(calls, responses, callRequests),
            ([call, { success, returnData }, callRequest]) => {
                try {
                    const outputs: unknown[] = call.fragment.outputs!;
                    const params = TRANSFORMER.decodeFunctionResult(call.fragment, returnData);

                    // If we do the !success check before the decode, we cannot get the error message of
                    // decodeFunctionResult. So we always decode first, then check the success later.
                    if (!success) {
                        const callId = FunctionFragment.from(call.fragment).format();
                        throw new Error(`Call ${call.address}:${callId} failed`);
                    }

                    const data: unknown = outputs.length === 1 ? params[0] : params;
                    return { type: 'success' as const, data };
                } catch (e: any) {
                    if (e.reason == null) {
                        e.reason = 'Call failed for unknown reason';
                    }
                    const error = new MulticallError(e, callRequest.callData);
                    return { type: 'failed' as const, error };
                }
            }
        );
        return result;
    }

    /**
     * Perform _soft_ wrapping. If muticall is presented, multicall.wrap(contract) will be returned.
     * Otherwise the contract itself will be returned. Note that this function is also type-safe,
     * that is, even if the contract is returned, the user is disallowed to call functions
     * with overrides.
     *
     * This function is useful in case where the user when to choose whether to use multicall
     * by themselves.
     */
    static wrap<T extends Contract>(contract: ContractLike<T>, multicall: Multicall | undefined): MulticallStatic<T> {
        return multicall ? multicall.wrap(contract) : (contract as unknown as MulticallStatic<T>);
    }

    wrap<T extends Contract>(contract_: ContractLike<T>): MulticallStatic<T> {
        if (this.cacheWrappedContract.has(contract_)) {
            return this.cacheWrappedContract.get(contract_) as MulticallStatic<T>;
        }

        const functions = contract_.interface.functions;
        const funcs: Record<string, (...args: any[]) => Promise<any>> = {};

        for (const [_, fn] of Object.entries(functions)) {
            funcs[fn.name] = async (...params: any[]) => {
                let blockTag: BlockTag = 'latest';
                if (params.length === fn.inputs.length + 1) {
                    const overrides: MulticallOverrides = params.pop() ?? {};
                    if (!Multicall.isMulticallOverrides(overrides)) {
                        throw new PendleSdkError('Overrides for multicall should contain only blockTag property');
                    }
                    blockTag = (await overrides.blockTag) ?? 'latest';
                }

                const contractCall = new ContractCall({
                    fragment: fn,
                    address: toAddress(contract_.address),
                    params,
                });

                return this.getBatch(blockTag).execute(contractCall);
            };
        }

        const res = { callStatic: funcs } as unknown as MulticallStatic<T>;

        this.cacheWrappedContract.set(contract_, res);

        return res;
    }

    getBatch(blockTag: BlockTag) {
        return this.batchMap.get(blockTag) ?? new MulticallBatch(this, blockTag);
    }
}

class MulticallBatch extends batcher.StaticStorageBatcher<ContractCall> {
    constructor(
        private readonly multicallInstance: Multicall,
        readonly blockTag: BlockTag = 'latest'
    ) {
        super();
        this.multicallInstance.batchMap.set(this.blockTag, this);
    }

    override getMessageQueue(): batcher.BatchMessageEntry<ContractCall>[] {
        if (this.queue.length >= this.multicallInstance.callLimit) {
            this.queue = [];
        }
        return this.queue;
    }

    override async batchExecute(params: ContractCall[]): Promise<batcher.BatchExecutionResult[]> {
        return this.multicallInstance.doAggregateCalls(params, this.blockTag);
    }
}
