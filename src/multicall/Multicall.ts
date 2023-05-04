import type { BlockTag } from '@ethersproject/abstract-provider';
import type { Provider } from '@ethersproject/providers';
import { Contract, CallOverrides } from 'ethers';
import { FunctionFragment, Interface } from 'ethers/lib/utils';
import { EthersJsError, PendleSdkError } from '../errors';
import { Address, toAddress, ChainId, RemoveLastOptionalParam, AddParams, zip } from '../common';
import { ContractLike } from '../contracts/types';
import {
    MulticallAggregateCaller,
    MulticallAggregateCallerNoGasLimit,
    MulticallAggregateCallerWithGasLimit,
} from './MulticallAggregateCaller';

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
    params: any[];

    constructor({ fragment, address, params }: { fragment: FunctionFragment; address: Address; params: any[] }) {
        this.fragment = fragment;
        this.address = address;
        this.params = params;
    }
}

export type MulticallOverrides = {
    blockTag?: BlockTag | Promise<BlockTag>;
};

export type MulticallStatic<T extends Contract> = {
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

    private multicallAggregateCaller: MulticallAggregateCaller;
    public readonly batchMap = new Map<BlockTag, MulticallBatch>();
    public readonly cacheWrappedContract = new WeakMap<ContractLike, MulticallStatic<Contract>>();
    readonly callLimit: number;

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

    constructor(params: { chainId: ChainId; provider: Provider; callLimit?: number; withGasLimit?: boolean }) {
        const { callLimit, withGasLimit = true } = params;
        this.callLimit = callLimit ?? DEFAULT_CALL_LIMIT;
        if (withGasLimit) {
            this.multicallAggregateCaller = new MulticallAggregateCallerWithGasLimit(params);
        } else {
            this.multicallAggregateCaller = new MulticallAggregateCallerNoGasLimit(params);
        }
    }

    async doAggregateCalls(calls: readonly ContractCall[], blockTag: BlockTag) {
        const callRequests = calls.map((call) => ({
            target: call.address,
            callData: TRANSFORMER.encodeFunctionData(call.fragment, call.params),
        }));

        const responses = await this.multicallAggregateCaller.tryAggregate(callRequests, { blockTag });

        const result = Array.from(zip(calls, responses), ([call, { success, returnData }]) => {
            try {
                const outputs: any[] = call.fragment.outputs!;
                const params = TRANSFORMER.decodeFunctionResult(call.fragment, returnData);

                // If we do the !success check before the decode, we cannot get the error message of
                // decodeFunctionResult. So we always decode first, then check the success later.
                if (!success) {
                    const callId = FunctionFragment.from(call.fragment).format();
                    throw new Error(`Call ${call.address}:${callId} failed`);
                }

                return outputs.length === 1 ? params[0] : params;
            } catch (e: any) {
                if (e.reason == null) {
                    e.reason = 'Call failed for unknown reason';
                }
                return EthersJsError.handleEthersJsError(e);
            }
        });

        return result;
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
                const res = new Promise((resolve, reject) => {
                    let currentBatch = this.batchMap.get(blockTag);
                    if (currentBatch === undefined) {
                        currentBatch = new MulticallBatch(this, blockTag);
                        this.batchMap.set(blockTag, currentBatch);
                    }
                    const dataPos = currentBatch.pendingContractCalls.length;
                    currentBatch.pendingContractCalls.push(contractCall);
                    currentBatch.promise
                        .then((currentResult) =>
                            currentResult[dataPos] instanceof Error
                                ? reject(currentResult[dataPos])
                                : resolve(currentResult[dataPos])
                        )
                        .catch(reject);
                    if (currentBatch.pendingContractCalls.length >= this.callLimit) {
                        this.batchMap.delete(blockTag);
                    }
                });

                return res;
            };
        }

        const res = { callStatic: funcs } as unknown as MulticallStatic<T>;

        this.cacheWrappedContract.set(contract_, res);

        return res;
    }
}

class MulticallBatch {
    readonly pendingContractCalls: ContractCall[] = [];
    readonly promise: Promise<any[]>;

    constructor(private readonly multicallInstance: Multicall, readonly blockTag: BlockTag = 'latest') {
        this.promise = Promise.resolve().then(async () => {
            // effects

            // instance comparison
            if (this.multicallInstance.batchMap.get(this.blockTag) === this) {
                this.multicallInstance.batchMap.delete(this.blockTag);
            }

            // interactions
            return this.multicallInstance.doAggregateCalls(this.pendingContractCalls, this.blockTag);
        });
    }
}
