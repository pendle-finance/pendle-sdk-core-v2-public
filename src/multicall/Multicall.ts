import type { BlockTag } from '@ethersproject/abstract-provider';
import type { Provider } from '@ethersproject/providers';
import type { Multicall2 } from './Multicall2';
import { Contract } from 'ethers';
import { FunctionFragment, Interface } from 'ethers/lib/utils';
import { MULTICALL_ADDRESSES } from '../constants';
import { abi as MulticallABI } from './Multicall2.json';

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
    address: string;
    params: any[];

    constructor({ fragment, address, params }: { fragment: FunctionFragment; address: string; params: any[] }) {
        this.fragment = fragment;
        this.address = address;
        this.params = params;
    }
}

type RemoveLastOptionalParam<T extends any[]> = T extends [...infer Head, any?] ? Head : T;
export type MulticallStatic<T extends Contract> = {
    callStatic: {
        [P in keyof T['callStatic']]: (
            ...params: RemoveLastOptionalParam<Parameters<T['callStatic'][P]>>
        ) => ReturnType<T['callStatic'][P]>;
    };
};

export class Multicall {
    private multicallContract: Multicall2;
    public currentBatch: MulticallBatch | undefined = undefined;
    readonly blockTag: BlockTag;
    readonly callLimit: number;

    // Note: this symbol is unique for each Multicall instance
    readonly multicallStaticSymbol = Symbol.for('multicallStatic');

    /**
     * Perform _soft_ wrapping. If muticall is presented, multicall.wrap(contract) will be returned.
     * Otherwise the contract itself will be returned. Note that this function is also type-safe,
     * that is, even if the contract is returned, the user is disallowed to call functions
     * with overrides.
     *
     * This function is useful in case where the user when to choose whether to use multicall
     * by themselves.
     */
    static wrap<T extends Contract>(contract: T, multicall: Multicall | undefined): MulticallStatic<T> {
        return multicall ? multicall.wrap(contract) : (contract as unknown as MulticallStatic<T>);
    }

    constructor({
        chainId,
        provider,
        blockTag,
        callLimit,
    }: {
        chainId: number;
        provider: Provider;
        blockTag?: BlockTag;
        callLimit?: number;
    }) {
        this.multicallContract = new Contract(MULTICALL_ADDRESSES[chainId], MulticallABI, provider) as Multicall2;
        this.blockTag = blockTag ?? 'latest';
        this.callLimit = callLimit ?? DEFAULT_CALL_LIMIT;
    }

    async doAggregateCalls(calls: readonly ContractCall[], blockTag: BlockTag) {
        const callRequests = calls.map((call) => ({
            target: call.address,
            callData: TRANSFORMER.encodeFunctionData(call.fragment, call.params),
        }));

        let responses = await this.multicallContract.callStatic.tryAggregate(false, callRequests, {
            blockTag: blockTag,
        });

        const result = calls.map((call, i) => {
            const [success, returnData] = responses[i];

            try {
                const outputs: any[] = call.fragment.outputs!;
                const params = TRANSFORMER.decodeFunctionResult(call.fragment, returnData);

                // If we do the !success check before the decode, we cannot get the error message of
                // decodeFunctionResult. So we always decode first, then check the success later.
                if (!success) {
                    let callId = FunctionFragment.from(call.fragment).format();
                    throw new Error(`Call ${call.address}:${callId} failed`);
                }

                return outputs.length === 1 ? params[0] : params;
            } catch (e: any) {
                if (e.reason == null) {
                    e.reason = 'Call failed for unknown reason';
                }
                return e;
            }
        });

        return result;
    }

    wrap<T extends Contract>(contract_: T): MulticallStatic<T> {
        const contract = contract_ as T & { [key in symbol]: MulticallStatic<T> };
        if (contract[this.multicallStaticSymbol]) {
            return contract[this.multicallStaticSymbol];
        }
        const functions = contract.interface.functions;
        const funcs: Record<string, (...args: any[]) => Promise<any>> = {};

        for (const [_, fn] of Object.entries(functions)) {
            funcs[fn.name] = (...params: any[]) => {
                const contractCall = new ContractCall({
                    fragment: fn,
                    address: contract.address,
                    params,
                });
                const res = new Promise((resolve, reject) => {
                    if (this.currentBatch === undefined) {
                        this.currentBatch = new MulticallBatch(this);
                    }
                    const dataPos = this.currentBatch.pendingContractCalls.length;
                    this.currentBatch.pendingContractCalls.push(contractCall);
                    this.currentBatch.promise
                        .then((currentResult) =>
                            currentResult[dataPos] instanceof Error
                                ? reject(currentResult[dataPos])
                                : resolve(currentResult[dataPos])
                        )
                        .catch(reject);
                    if (this.currentBatch.pendingContractCalls.length >= this.callLimit) {
                        this.currentBatch = undefined;
                    }
                });

                return res;
            };
        }

        const res = { callStatic: funcs } as unknown as MulticallStatic<T>;

        // Do this to avoid typescript error.
        Object.assign(contract, { [this.multicallStaticSymbol]: res });

        return res;
    }
}

class MulticallBatch {
    readonly pendingContractCalls: ContractCall[] = [];
    readonly promise: Promise<any[]>;

    constructor(private readonly multicallInstance: Multicall) {
        this.promise = Promise.resolve().then(async () => {
            // effects

            // instance comparison
            if (this.multicallInstance.currentBatch === this) {
                this.multicallInstance.currentBatch = undefined;
            }

            // interactions
            return this.multicallInstance.doAggregateCalls(this.pendingContractCalls, this.multicallInstance.blockTag);
        });
    }
}
