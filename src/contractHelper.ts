import {
    Contract,
    BaseContract,
    type ContractInterface,
    type ContractFunction,
    Signer,
    providers,
    BigNumber as BN,
    CallOverrides,
} from 'ethers';
import { Address, NetworkConnection, RemoveLastOptional } from './types';
import { PendleSdkError, EthersJsError, GasEstimationError } from './errors';
import { Multicall, MulticallStatic } from './multicall';

export type Provider = providers.Provider;

const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');

type AddOptionalParam<Fn extends (...params: any[]) => any, P> = (...params: [...Parameters<Fn>, P?]) => ReturnType<Fn>;

type BuildMetaMethod<C extends BaseContract, MethodName extends keyof C['functions'], Params extends any[]> = <
    T extends MetaMethodType = 'send',
    D extends {} = {}
>(
    ...params: [...Params, T?, D?]
) => MetaMethodReturnType<T, C, MethodName, D>;

type MetaMethod<C extends BaseContract, MethodName extends keyof C['functions']> = BuildMetaMethod<
    C,
    MethodName,
    RemoveLastOptional<Parameters<C['callStatic'][MethodName]>>
>;

export type WrappedContractConfig = {
    readonly multicall?: Multicall;
};

export interface BaseWrappedContract<T extends BaseContract = Contract> extends WrappedContractConfig {
    address: Address;
    provider: T['provider'];
    signer: T['signer'];
    readonly interface: T['interface'];
    readonly [ORIGINAL_CONTRACT]: T;

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;

    readonly functions: T['functions'];
    readonly callStatic: T['callStatic'];
    readonly estimateGas: T['estimateGas'];
    readonly multicallStatic: {
        [P in keyof MulticallStatic<T>['callStatic']]: AddOptionalParam<MulticallStatic<T>['callStatic'][P], Multicall>;
    };
    readonly metaCall: {
        [P in keyof T['functions']]: MetaMethod<T, P>;
    };
}

export type ContractMethods<T extends Contract> = {
    [key in keyof T as Exclude<key, keyof BaseWrappedContract>]: T[key] extends ContractFunction ? T[key] : undefined;
};
export type WrappedContract<T extends BaseContract = Contract> = ContractMethods<T> & BaseWrappedContract<T>;

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

export function wrapContractObject<T extends Contract>(
    contract: T,
    config: WrappedContractConfig = {}
): WrappedContract<T> {
    const multicallStatic: any = {};
    const metaCall: any = {};
    const methods: any = {};
    for (const fragment of contract.interface.fragments) {
        if (fragment.type !== 'function') {
            continue;
        }
        const name = fragment.name;
        multicallStatic[name] = async function (this: WrappedContract<T>, ...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError(`Argument count mismatch for multicall static of ${name}.`);
            }
            const multicall: Multicall | undefined = args.length === argCount ? this.multicall : args.pop();
            return Multicall.wrap(contract, multicall).callStatic[name](...(args as any));
        };

        metaCall[name] = async function (this: WrappedContract<T>, ...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1 && args.length !== argCount + 2) {
                throw new PendleSdkError(`Argument count mismatch for meta call of ${name}.`);
            }
            const data = args.length === argCount + 2 ? args.pop() : undefined;
            const methodType: MetaMethodType | undefined = args.length === argCount + 1 ? args.pop() : undefined;
            return callMetaMethod(
                methodType,
                contract,
                name,
                (method, methodName, data) => {
                    if (methodName === 'multicallStatic') return method(...args);
                    return method(...args, data.overrides);
                },
                data
            );
        };
        methods[name] = wrapFunction(contract[name]);
    }

    // Typing here just to make sure all the fields exist
    const result: Record<keyof BaseWrappedContract, any> = {
        ...methods,
        ...config,
        [ORIGINAL_CONTRACT]: contract,
        address: contract.address,
        provider: contract.provider,
        signer: contract.signer,
        interface: contract.interface,
        functions: wrapFunctions(contract.functions),
        callStatic: wrapFunctions(contract.callStatic),
        estimateGas: wrapFunctions(contract.estimateGas, wrapEstimateGasFunction),
        multicallStatic,
        metaCall,
        connect(signerOrProvider: string | Signer | Provider) {
            return wrapContractObject(contract.connect(signerOrProvider), {
                multicall: result.multicall,
            });
        },
        attach(addressOrName: string) {
            return wrapContractObject(contract.attach(addressOrName), {
                multicall: result.metaCall,
            });
        },
    };

    Object.defineProperty(result, ORIGINAL_CONTRACT, {
        enumerable: false,
        value: contract,
    });

    return result as WrappedContract<T>;
}

export type ContractObjectConfig = WrappedContractConfig & { doWrap?: boolean };

export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    config: WrappedContractConfig & { doWrap: false }
): T;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    config?: ContractObjectConfig
): WrappedContract<T>;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    config: ContractObjectConfig = {}
): WrappedContract<T> | T {
    const doWrap = config.doWrap ?? true;
    let result: WrappedContract<T> | T;
    if (networkConnection.signer == undefined) {
        result = new Contract(address, abi, networkConnection.provider) as T;
    } else if (
        networkConnection.provider != undefined &&
        networkConnection.provider !== networkConnection.signer.provider
    ) {
        throw new PendleSdkError(
            'For contract creation, networkConnection.provider should be the same as networkConnection.signer.provider'
        );
    } else {
        result = new Contract(address, abi, networkConnection.signer) as T;
    }
    if (doWrap) {
        result = wrapContractObject(result);
    }
    return result;
}

export function isWrapped<T extends Contract>(
    contract: T | BaseWrappedContract<T>
): contract is BaseWrappedContract<T> {
    return ORIGINAL_CONTRACT in contract;
}

export function getInnerContract<T extends Contract>(wrappedContract: T | BaseWrappedContract<T>): T {
    if (isWrapped(wrappedContract)) {
        return wrappedContract[ORIGINAL_CONTRACT];
    }
    return wrappedContract;
}

// This interface is only for type calculation
interface MetaMethodTypeHelper<C extends BaseWrappedContract | BaseContract, MethodName extends keyof C['functions']> {
    functionMethod: C['functions'][MethodName];
    callStaticMethod: C['callStatic'][MethodName];
    estimateGasMethod: C['estimateGas'][MethodName];
    method: this['functionMethod'] | this['callStaticMethod'] | this['estimateGasMethod'];

    functionReturnType: Awaited<ReturnType<this['functionMethod']>>;
    callStaticReturnType: Awaited<ReturnType<this['callStaticMethod']>>;
    estimateGasReturnType: Awaited<ReturnType<this['estimateGasMethod']>>;

    returnType: this['functionReturnType'] | this['callStaticReturnType'] | this['estimateGasReturnType'];

    callback: (
        method: this['method'],
        methodType: MetaMethodType,
        data: ContractMetaMethodData
    ) => Promise<this['returnType']>;
}

export type ContractMetaMethodData = {
    overrides?: CallOverrides;
};

export class ContractMetaMethod<
    C extends BaseWrappedContract | BaseContract,
    M extends keyof C['functions'],
    Data extends ContractMetaMethodData
> {
    constructor(
        readonly contract: C,
        readonly methodName: M,
        readonly callback: MetaMethodTypeHelper<C, M>['callback'],
        readonly data: Data
    ) {}

    private addOverridesToData(overrides?: CallOverrides) {
        return {
            ...this.data,
            overrides: {
                ...overrides,
                ...this.data.overrides,
            },
        };
    }

    send(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['functionReturnType']> {
        return this.callback(
            this.contract.functions[this.methodName as string] as MetaMethodTypeHelper<C, M>['functionMethod'],
            'send',
            this.addOverridesToData(overrides)
        ) as Promise<MetaMethodTypeHelper<C, M>['functionReturnType']>;
    }

    callStatic(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']> {
        return this.callback(
            this.contract.callStatic[this.methodName as string] as MetaMethodTypeHelper<C, M>['callStaticMethod'],
            'callStatic',
            this.addOverridesToData(overrides)
        ) as Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']>;
    }

    /**
     * Note: make sure that when this function is called, no overrides should be passed.
     */
    multicallStatic(multicall?: Multicall): Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']> {
        return this.callback(
            Multicall.wrap(this.contract, multicall).callStatic[this.methodName as string] as MetaMethodTypeHelper<
                C,
                M
            >['callStaticMethod'],
            'multicallStatic',
            this.data
        ) as Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']>;
    }

    estimateGas(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['estimateGasReturnType']> {
        return this.callback(
            this.contract.estimateGas[this.methodName as string] as MetaMethodTypeHelper<C, M>['estimateGasMethod'],
            'estimateGas',
            this.addOverridesToData(overrides)
        ) as Promise<MetaMethodTypeHelper<C, M>['estimateGasReturnType']>;
    }
}

export type MetaMethodType = 'send' | 'callStatic' | 'estimateGas' | 'meta-method' | 'multicallStatic';
export type MetaMethodReturnType<
    T extends MetaMethodType,
    C extends BaseContract,
    M extends keyof C['functions'],
    Data extends {} = {}
> = Promise<
    'send' extends T
        ? MetaMethodTypeHelper<C, M>['functionReturnType']
        : 'callStatic' extends T
        ? MetaMethodTypeHelper<C, M>['callStaticReturnType']
        : 'multicallStatic' extends T
        ? MetaMethodTypeHelper<C, M>['callStaticReturnType']
        : 'estimateGas' extends T
        ? MetaMethodTypeHelper<C, M>['estimateGasReturnType']
        : 'meta-method' extends T
        ? ContractMetaMethod<C, M, Data & ContractMetaMethodData>
        : never
>;

export function callMetaMethod<
    T extends MetaMethodType | undefined,
    C extends BaseContract,
    M extends keyof C['functions'],
    Data extends {} = {}
>(
    methodType: T,
    contract: C,
    methodName: M,
    callback: MetaMethodTypeHelper<C, M>['callback'],
    data?: Data
): MetaMethodReturnType<NonNullable<T>, C, M, Data> {
    const metaMethod = new ContractMetaMethod(contract, methodName, callback, { overrides: {}, ...data });
    if (methodType === 'meta-method') return metaMethod as any;
    if (methodType === 'callStatic') return metaMethod.callStatic() as any;
    if (methodType === 'estimateGas') return metaMethod.estimateGas() as any;
    if (methodType === 'multicallStatic') return metaMethod.multicallStatic() as any;
    return metaMethod.send() as any;
}
