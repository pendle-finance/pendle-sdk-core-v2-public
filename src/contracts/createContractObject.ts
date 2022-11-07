import { Contract, type ContractInterface, type ContractFunction, Signer, providers, BigNumber as BN } from 'ethers';
import { Address, NetworkConnection } from '../types';
import { PendleSdkError, EthersJsError, GasEstimationError } from '../errors';
import { Multicall } from '../multicall';
import {
    MetaMethodExtraParams,
    ORIGINAL_CONTRACT,
    BaseWrappedContract,
    WrappedContract,
    WrappedContractConfig,
    MetaMethodType,
} from './types';
import { callMetaMethod } from './ContractMetaMethod';

type Provider = providers.Provider;

export function wrapFunction<T>(fn: ContractFunction<T>): ContractFunction<T> {
    return async function (this: any) {
        return fn.apply(this, arguments as unknown as any[]).catch((e) => {
            const err = EthersJsError.handleEthersJsError(e);
            throw err;
        });
    };
}

export function wrapEstimateGasFunction(fn: ContractFunction<BN>): ContractFunction<BN> {
    return async function (this: any) {
        return fn.apply(this, arguments as unknown as any[]).catch((e) => {
            // TODO wrap inside another error.
            const err = EthersJsError.handleEthersJsError(e);
            throw new GasEstimationError(err);
        });
    };
}

export function wrapFunctions<R, T extends { [key: string]: ContractFunction<R> }>(
    fns: T,
    wrapFunctionFn = wrapFunction<R>
): T {
    const res: any = {};
    for (const [name, fn] of Object.entries(fns)) {
        res[name] = wrapFunctionFn(fn);
    }
    return res;
}

export function wrapContractObject<C extends Contract>(
    contract: C,
    config: WrappedContractConfig = {}
): WrappedContract<C> {
    const multicallStatic: any = {};
    const metaCall: any = {};
    const methods: any = {};

    for (const fragment of contract.interface.fragments) {
        if (fragment.type !== 'function') {
            continue;
        }
        const name = fragment.name;
        multicallStatic[name] = async (...args: any[]) => {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError(`Argument count mismatch for multicall static of ${name}.`);
            }
            const multicall: Multicall | undefined =
                args.length === argCount ? result.multicall : args.pop().multicall ?? result.multicall;
            return Multicall.wrap(result, multicall).callStatic[name](...(args as any));
        };

        metaCall[name] = async (...args: any[]) => {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError(`Argument count mismatch for meta call of ${name}.`);
            }
            const data: MetaMethodExtraParams | undefined = args.length === argCount + 1 ? args.pop() : undefined;
            return callMetaMethod<C, any, MetaMethodType, any>(
                result as WrappedContract<C>,
                name,
                async (_methodName, method, data, contractMetaMethod) => {
                    const currentArgs = await Promise.all(
                        args.map(async (arg) => {
                            if (typeof arg === 'function') {
                                arg = await arg(contractMetaMethod);
                            }
                            return arg;
                        })
                    );
                    return method(...currentArgs, data.overrides);
                },
                data
            );
        };
        methods[name] = wrapFunction(contract[name]);
    }

    const result: Record<keyof BaseWrappedContract, any> = {
        multicall: config.multicall,
        [ORIGINAL_CONTRACT]: contract,
        address: contract.address,
        provider: contract.provider,
        signer: contract.signer,
        interface: contract.interface,
        functions: wrapFunctions(contract.functions),
        callStatic: wrapFunctions(contract.callStatic),
        estimateGas: wrapFunctions(contract.estimateGas, wrapEstimateGasFunction),
        filters: contract.filters,
        queryFilter: contract.queryFilter,
        multicallStatic,
        metaCall,
        connect(signerOrProvider: string | Signer | Provider) {
            return wrapContractObject(contract.connect(signerOrProvider), config);
        },
        attach(addressOrName: string) {
            return wrapContractObject(contract.attach(addressOrName), config);
        },
    };

    Object.defineProperty(result, ORIGINAL_CONTRACT, {
        enumerable: false,
        value: contract,
    });
    Object.assign(result, methods);

    return result as WrappedContract<C>;
}

export type ContractObjectConfig = NetworkConnection & WrappedContractConfig & { doWrap?: boolean };

export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: NetworkConnection & WrappedContractConfig & { doWrap: false }
): T;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: ContractObjectConfig
): WrappedContract<T>;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: ContractObjectConfig
): WrappedContract<T> | T {
    const doWrap = config.doWrap ?? true;
    let result: WrappedContract<T> | T;
    if (config.signer == undefined) {
        result = new Contract(address, abi, config.provider) as T;
    } else if (config.provider != undefined && config.provider !== config.signer.provider) {
        throw new PendleSdkError(
            'For contract creation, networkConnection.provider should be the same as networkConnection.signer.provider'
        );
    } else {
        result = new Contract(address, abi, config.signer) as T;
    }
    if (doWrap) {
        result = wrapContractObject(result, { multicall: config.multicall });
    }
    return result;
}
