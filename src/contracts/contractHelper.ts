import {
    Contract,
    type ContractInterface,
    type ContractFunction,
    Signer,
    providers,
    BigNumber as BN,
    CallOverrides,
} from 'ethers';
import { Address, NetworkConnection, RemoveLastOptionalParam, AddOptionalParam, GetField } from '../types';
import { PendleSdkError, EthersJsError, GasEstimationError } from '../errors';
import { Multicall } from '../multicall';

export type Provider = providers.Provider;

const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');

export type ContractMethodNames<C extends ContractLike> = keyof {
    [K in keyof C['callStatic'] as string extends K ? never : K]: true;
};

type MetaMethodParam<T, C extends Contract, MethodName extends ContractMethodNames<C>, Data extends {}> =
    | T
    | ((m: ContractMetaMethod<C, MethodName, Data>) => T | Promise<T>);

type MetaMethodParams<
    Params extends any[],
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends {}
> = Params extends [...infer Body, infer Last]
    ? [...MetaMethodParams<Body, C, MethodName, Data>, MetaMethodParam<Last, C, MethodName, Data>]
    : [];

type MetaMethod<C extends Contract, MethodName extends ContractMethodNames<C>> = C[MethodName] extends (
    ...params: [...infer Head, any?]
) => any
    ? <T extends MetaMethodType = 'send', D extends {} = {}>(
          ...params: [...MetaMethodParams<Head, C, MethodName, D>, T?, D?]
      ) => MetaMethodReturnType<T, C, MethodName, D>
    : never;

export type WrappedContractConfig = { readonly multicall?: Multicall };

export interface BaseWrappedContract<C extends Contract = Contract> extends WrappedContractConfig {
    address: Address;
    provider: C['provider'];
    signer: C['signer'];
    readonly interface: Omit<C['interface'], 'contractName'>;
    readonly [ORIGINAL_CONTRACT]: Contract;

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;

    readonly functions: C['functions'];
    readonly callStatic: C['callStatic'];
    readonly estimateGas: C['estimateGas'];
    readonly multicallStatic: {
        [P in ContractMethodNames<C>]: AddOptionalParam<
            RemoveLastOptionalParam<GetField<C['callStatic'], P>>,
            Multicall
        >;
    };
    readonly metaCall: { [P in ContractMethodNames<C>]: MetaMethod<C, P> };
}

export type ContractMethods<T extends Contract> = { [key in ContractMethodNames<T>]: T[key] };

export type WrappedContract<T extends Contract = Contract> = ContractMethods<T> & BaseWrappedContract<T>;

export type ContractLike<T extends Contract = Contract> = T | WrappedContract<T>;

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

    // Typing here just to make sure all the fields exist
    let result: Record<keyof BaseWrappedContract, any>;

    for (const fragment of contract.interface.fragments) {
        if (fragment.type !== 'function') {
            continue;
        }
        const name = fragment.name;
        multicallStatic[name] = async function (...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError(`Argument count mismatch for multicall static of ${name}.`);
            }
            const multicall: Multicall | undefined = args.length === argCount ? this.multicall : args.pop();
            return Multicall.wrap(result, multicall).callStatic[name](...(args as any));
        };

        metaCall[name] = async function (...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1 && args.length !== argCount + 2) {
                throw new PendleSdkError(`Argument count mismatch for meta call of ${name}.`);
            }
            const data = args.length === argCount + 2 ? args.pop() : undefined;
            const methodType: MetaMethodType | undefined = args.length === argCount + 1 ? args.pop() : undefined;
            return callMetaMethod<MetaMethodType | undefined, C, any, any>(
                methodType,
                result as WrappedContract<C>,
                name,
                async (method, _methodName, data, contractMetaMethod) => {
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

    result = {
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

export function isWrapped<T extends Contract>(contract: ContractLike<T>): contract is WrappedContract<T> {
    return ORIGINAL_CONTRACT in contract;
}

export function getInnerContract<T extends Contract>(wrappedContract: ContractLike<T>): T {
    if (isWrapped(wrappedContract)) {
        return wrappedContract[ORIGINAL_CONTRACT] as T;
    }
    return wrappedContract;
}

// This interface is only for type calculation
interface MetaMethodTypeHelper<C extends Contract, MethodName extends ContractMethodNames<C>> {
    functionMethod: GetField<C['functions'], MethodName>;
    callStaticMethod: GetField<C['callStatic'], MethodName>;
    estimateGasMethod: GetField<C['estimateGas'], MethodName>;
    method: this['functionMethod'] | this['callStaticMethod'] | this['estimateGasMethod'];

    functionReturnType: Awaited<ReturnType<this['functionMethod']>>;
    callStaticReturnType: Awaited<ReturnType<this['callStaticMethod']>>;
    estimateGasReturnType: Awaited<ReturnType<this['estimateGasMethod']>>;

    returnType: this['functionReturnType'] | this['callStaticReturnType'] | this['estimateGasReturnType'];

    callback: <SubC extends C, Data extends ContractMetaMethodData>(
        method: this['method'],
        methodType: MetaMethodType,
        data: Data,
        contractMetaMethod: ContractMetaMethod<SubC, MethodName, Data>
    ) => Promise<this['returnType']>;
}

export type ContractMetaMethodData = {
    overrides?: CallOverrides;
};

export class ContractMetaMethod<
    C extends Contract,
    M extends ContractMethodNames<C>,
    Data extends ContractMetaMethodData
> {
    constructor(
        readonly contract: WrappedContract<C>,
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

    withContract(newContract: WrappedContract<C>): ContractMetaMethod<C, M, Data> {
        return new ContractMetaMethod(newContract, this.methodName, this.callback, this.data);
    }

    connect(signerOrProvider: Signer | Provider) {
        const newContract = this.contract.connect(signerOrProvider);
        return this.withContract(newContract);
    }

    send(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['functionReturnType']> {
        return this.callback(
            this.contract.functions[this.methodName as string] as MetaMethodTypeHelper<C, M>['functionMethod'],
            'send',
            this.addOverridesToData(overrides),
            this
        ) as Promise<MetaMethodTypeHelper<C, M>['functionReturnType']>;
    }

    callStatic(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']> {
        return this.callback(
            this.contract.callStatic[this.methodName as string] as MetaMethodTypeHelper<C, M>['callStaticMethod'],
            'callStatic',
            this.addOverridesToData(overrides),
            this
        ) as Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']>;
    }

    /**
     * Note: this method removes overrides from the arguments.
     */
    multicallStatic(multicall?: Multicall): Promise<MetaMethodTypeHelper<C, M>['callStaticReturnType']> {
        const callback = ((...args: any[]) => {
            const argCount = getInnerContract(this.contract).interface.functions[this.methodName as string].inputs
                .length;
            if (args.length === argCount + 1) {
                args.pop();
            }
            Multicall.wrap(this.contract, multicall).callStatic[this.methodName as string](...(args as any));
        }) as MetaMethodTypeHelper<C, M>['callStaticMethod'];
        return this.callback(callback, 'multicallStatic', this.data, this) as Promise<
            MetaMethodTypeHelper<C, M>['callStaticReturnType']
        >;
    }

    estimateGas(overrides?: CallOverrides): Promise<MetaMethodTypeHelper<C, M>['estimateGasReturnType']> {
        return this.callback(
            this.contract.estimateGas[this.methodName as string] as MetaMethodTypeHelper<C, M>['estimateGasMethod'],
            'estimateGas',
            this.addOverridesToData(overrides),
            this
        ) as Promise<MetaMethodTypeHelper<C, M>['estimateGasReturnType']>;
    }

    static utils = {
        getContractSignerAddress<C extends Contract>(contractMetaMethod: ContractMetaMethod<C, any, {}>) {
            return contractMetaMethod.contract.signer.getAddress();
        },
    };
}

export type MetaMethodType = 'send' | 'callStatic' | 'estimateGas' | 'meta-method' | 'multicallStatic';
export type MetaMethodReturnType<
    T extends MetaMethodType,
    C extends Contract,
    M extends ContractMethodNames<C>,
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
    C extends Contract,
    M extends ContractMethodNames<C>,
    Data extends {} = {}
>(
    methodType: T,
    contract: WrappedContract<C>,
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
