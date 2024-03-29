import { Contract, type ContractInterface, type ContractFunction, Signer, providers, BigNumber as BN } from 'ethers';
import { PendleSdkError, EthersJsError, GasEstimationError } from '../errors';
import { Multicall } from '../multicall';
import {
    MetaMethodExtraParams,
    ORIGINAL_CONTRACT,
    BaseWrappedContract,
    WrappedContract,
    WrappedContractConfig,
    MetaMethodType,
    MulticallStaticParams,
} from './types';
import { callMetaMethod } from './ContractMetaMethod';
import { Address, NetworkConnection } from '../common';
import { Fragment, FunctionFragment } from 'ethers/lib/utils';

type Provider = providers.Provider;

export function wrapFunction<T>(fn: ContractFunction<T>): ContractFunction<T> {
    return async function (this: object, ...params: any[]) {
        return fn.apply(this, params).catch((e) => {
            const err = EthersJsError.handleEthersJsError(e);
            throw err;
        });
    };
}

export function wrapEstimateGasFunction(fn: ContractFunction<BN>): ContractFunction<BN> {
    return async function (this: object, ...params: any[]) {
        return fn.apply(this, params).catch((e) => {
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
    const functionFragmentsMapping: any = {};

    // noPropertyAccessFromIndexSignature option is not turned on in tsconfig yet.
    // To keep the code compatible, we explicitly said it might be undefined.
    const uniqueFragNames: Record<string, Array<FunctionFragment> | undefined> = {};

    for (const fragment of contract.interface.fragments) {
        if (fragment.type !== 'function') {
            continue;
        }

        const { name } = fragment;
        const group = uniqueFragNames[name];
        if (!group) {
            uniqueFragNames[name] = [fragment as FunctionFragment];
        } else {
            group.push(fragment as FunctionFragment);
        }
    }

    const fragments: Array<FunctionFragment> = [];
    for (const name of Object.keys(uniqueFragNames)) {
        const group = uniqueFragNames[name];

        if (!group) {
            // Should not have happened tho. Continue to narrow to Non-nullable.
            continue;
        }
        if (group.length > 1) {
            for (const fragment of group) {
                // A hack here, create new fragments with name equals to the signature
                // For example, if there is 2 foo functions: foo(uint256) and foo(uint256, uint256)
                // there will be 2 new fragments with name foo(uint256) and foo(uint256, uint256),
                // and we will create 2 functions with those name (without creating the `foo` function)
                const newFragment = Fragment.from({
                    ...fragment,
                    name: fragment.format(),
                } as any) as FunctionFragment;
                fragments.push(newFragment);
            }
        } else {
            fragments.push(group[0]);
        }
    }

    for (const fragment of fragments) {
        if (fragment.type !== 'function') {
            continue;
        }
        const name = fragment.name;
        functionFragmentsMapping[name] = fragment;

        multicallStatic[name] = async (...args: any[]) => {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError(`Argument count mismatch for multicall static of ${name}.`);
            }
            let { multicall, overrides }: MulticallStaticParams = (args.length === argCount
                ? undefined
                : args.pop()) ?? { multicall: result.multicall };

            overrides ??= {};
            if (!Multicall.isMulticallOverrides(overrides)) {
                return result.callStatic[name](...(args as any), overrides);
            }
            return Multicall.wrap(result, multicall).callStatic[name](...(args as any), overrides);
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
        functionFragmentsMapping,
        functions: wrapFunctions(contract.functions),
        populateTransaction: contract.populateTransaction,
        callStatic: wrapFunctions(contract.callStatic),
        estimateGas: wrapFunctions(contract.estimateGas, wrapEstimateGasFunction),
        filters: contract.filters,
        queryFilter: contract.queryFilter.bind(contract),
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

export let createEthersContract = <T extends Contract>(...params: ConstructorParameters<typeof Contract>) =>
    new Contract(...params) as T;

export function createContractObjectImpl<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: NetworkConnection & WrappedContractConfig & { doWrap: false }
): T;
export function createContractObjectImpl<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: ContractObjectConfig
): WrappedContract<T>;
export function createContractObjectImpl<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    config: ContractObjectConfig
): WrappedContract<T> | T {
    const doWrap = config.doWrap ?? true;
    let result: WrappedContract<T> | T;
    if (config.signer == undefined) {
        result = createEthersContract<T>(address, abi, config.provider);
    } else if (config.provider != undefined && config.provider !== config.signer.provider) {
        throw new PendleSdkError(
            'For contract creation, networkConnection.provider should be the same as networkConnection.signer.provider'
        );
    } else {
        result = createEthersContract<T>(address, abi, config.signer);
    }
    if (doWrap) {
        result = wrapContractObject(result, { multicall: config.multicall });
    }
    return result;
}

export let createContractObject = createContractObjectImpl;

/**
 * Replacer for {@link createEthersContract}
 * @remarks
 * Can be use to do dynamic operations, such as hooks.
 */
export function replaceCreateEthersContractFunction(fn: typeof createEthersContract) {
    createEthersContract = fn;
}

/**
 * Replacer for {@link createContractObject}
 * @remarks
 * Can be use to do dynamic operations, such as hooks.
 */
export function replaceCreateContractObjectFunction(fn: typeof createContractObject) {
    createContractObject = fn;
}
