import type { BlockTag } from '@ethersproject/abstract-provider';
import type { Provider } from '@ethersproject/providers';
import type { Multicall2 } from './Multicall2';
import { Contract, CallOverrides } from 'ethers';
import { FunctionFragment, Interface } from 'ethers/lib/utils';
import { abi as MulticallABI } from './Multicall2.json';
import { EthersJsError, PendleSdkError } from '../errors';
import { Address, ChainId, CHAIN_ID_MAPPING, RemoveLastOptionalParam, AddParams } from '../common';
import { ContractLike } from '../contracts/types';
import { getInnerContract } from '../contracts/helper';

export const MULTICALL_ADDRESSES: Record<ChainId, Address> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: '0x5ba1e12693dc8f9c48aad8770482f4739beed696',
    [CHAIN_ID_MAPPING.AVALANCHE]: '0x11b8399bc71e8b67a0f7cca2663612af1ca38536',
    [CHAIN_ID_MAPPING.FUJI]: '0x07e46d95cc98f0d7493d679e89e396ea99020185',
    [CHAIN_ID_MAPPING.MUMBAI]: '0x7De28d05a0781122565F3b49aA60331ced983a19',
    [CHAIN_ID_MAPPING.ARBITRUM]: '0xcA11bde05977b3631167028862bE2a173976CA11',
} as const;

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
        for (const key in Object.keys(overrides)) {
            if (key !== 'blockTag' && (overrides as any)[key] != undefined) {
                return false;
            }
        }
        return true;
    }

    private multicallContract: Multicall2;
    public readonly batchMap = new Map<BlockTag, MulticallBatch>();
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
    static wrap<T extends Contract>(contract: ContractLike<T>, multicall: Multicall | undefined): MulticallStatic<T> {
        return multicall ? multicall.wrap(contract) : (contract as unknown as MulticallStatic<T>);
    }

    constructor({ chainId, provider, callLimit }: { chainId: ChainId; provider: Provider; callLimit?: number }) {
        this.multicallContract = new Contract(MULTICALL_ADDRESSES[chainId], MulticallABI, provider) as Multicall2;
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
                return EthersJsError.handleEthersJsError(e);
            }
        });

        return result;
    }

    wrap<T extends Contract>(contract_: ContractLike<T>): MulticallStatic<T> {
        contract_ = getInnerContract(contract_);
        const contract = contract_ as T & { [key in symbol]: MulticallStatic<T> };
        if (contract[this.multicallStaticSymbol]) {
            return contract[this.multicallStaticSymbol];
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
                    address: contract.address,
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

        // Do this to avoid typescript error.
        Object.assign(contract, { [this.multicallStaticSymbol]: res });

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
