import {
    Contract,
    BaseContract,
    type ContractInterface,
    type ContractFunction,
    Signer,
    providers,
    BigNumber as BN,
    Overrides,
} from 'ethers';
import { Address, NetworkConnection, RemoveLastOptional } from './types';
import { PendleSdkError, EthersJsError, GasEstimationError } from './errors';
import { Multicall, MulticallStatic } from './multicall';

export type Provider = providers.Provider;

const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');

type AddOptionalParam<Fn extends (...params: any[]) => any, P> = (...params: [...Parameters<Fn>, P?]) => ReturnType<Fn>;

type BuildMetaMethod<C extends BaseContract, MethodName extends keyof C['functions'], Params extends any[]> = <
    T extends MetaMethodType | undefined = 'send'
>(
    ...params: [...Params, T?]
) => MetaMethodReturnType<T | undefined, C, MethodName>;

type MetaMethod<C extends BaseContract, MethodName extends keyof C['functions']> = BuildMetaMethod<
    C,
    MethodName,
    RemoveLastOptional<Parameters<C['callStatic'][MethodName]>>
>;

export interface BaseContractLike<T extends BaseContract = Contract> {
    address: Address;
    provider: T['provider'];
    signer: T['signer'];
    interface: T['interface'];
    [ORIGINAL_CONTRACT]: T;

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;

    functions: T['functions'];
    callStatic: T['callStatic'];
    estimateGas: T['estimateGas'];
    multicallStatic: {
        [P in keyof MulticallStatic<T>['callStatic']]: AddOptionalParam<MulticallStatic<T>['callStatic'][P], Multicall>;
    };
    metaCall: {
        [P in keyof T['functions']]: MetaMethod<T, P>;
    };
}

export type ContractMethods<T extends Contract> = {
    [key in keyof T as Exclude<key, keyof BaseContractLike>]: T[key] extends ContractFunction ? T[key] : undefined;
};
export type ContractLike<T extends BaseContract = Contract> = ContractMethods<T> & BaseContractLike<T>;

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

export function wrapContractObject<T extends Contract>(contract: T): ContractLike<T> {
    const multicallStatic: any = {};
    const metaCall: any = {};
    const methods: any = {};
    for (const fragment of contract.interface.fragments) {
        if (fragment.type !== 'function') {
            continue;
        }
        const name = fragment.name;
        multicallStatic[name] = async function (this: any, ...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError('Argument count mismatch for multicall static of .');
            }
            const multicall: Multicall | undefined = args.length === argCount ? undefined : args.pop();
            return Multicall.wrap(contract, multicall).callStatic[name](...(args as any));
        };

        metaCall[name] = async function (this: any, ...args: any[]) {
            const argCount = fragment.inputs.length;
            if (args.length !== argCount && args.length !== argCount + 1) {
                throw new PendleSdkError('Argument count mismatch for multicall static of .');
            }
            const methodType: MetaMethodType | undefined = args.length === argCount ? undefined : args.pop();
            return callMetaMethod(methodType, contract, name, (method) => method(...args));
        };
        methods[name] = wrapFunction(contract[name]);
    }

    // Typing here just to make sure all the fields exist
    const result: Record<keyof BaseContractLike, any> = {
        ...methods,
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
            return wrapContractObject(contract.connect(signerOrProvider));
        },
        attach(addressOrName: string) {
            return wrapContractObject(contract.attach(addressOrName));
        },
    };

    Object.defineProperty(result, ORIGINAL_CONTRACT, {
        enumerable: false,
        value: contract,
    });

    return result as ContractLike<T>;
}

export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    doWrap: false
): T;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    doWrap?: boolean
): ContractLike<T>;
export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection,
    doWrap: boolean = true
): ContractLike<T> | T {
    let result: ContractLike<T> | T;
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

export function isWrapped<T extends Contract>(contract: T | BaseContractLike<T>): contract is BaseContractLike<T> {
    return ORIGINAL_CONTRACT in contract;
}

export function getInnerContract<T extends Contract>(wrappedContract: T | BaseContractLike<T>): T {
    if (isWrapped(wrappedContract)) {
        return wrappedContract[ORIGINAL_CONTRACT];
    }
    return wrappedContract;
}

// This interface is only for type calculation
interface MetaMethodTypeHelper<C extends BaseContractLike | BaseContract, MethodName extends keyof C['functions']> {
    functionMethod: C['functions'][MethodName];
    callStaticMethod: C['callStatic'][MethodName];
    estimateGasMethod: C['estimateGas'][MethodName];
    method: this['functionMethod'] | this['callStaticMethod'] | this['estimateGasMethod'];

    functionReturnType: ReturnType<this['functionMethod']>;
    callStaticReturnType: ReturnType<this['callStaticMethod']>;
    estimateGasReturnType: ReturnType<this['estimateGasMethod']>;

    returnType: Promise<
        | Awaited<this['functionReturnType']>
        | Awaited<this['callStaticReturnType']>
        | Awaited<this['estimateGasReturnType']>
    >;

    callback: (method: this['method'], overrides?: Overrides) => this['returnType'];
}

export class ContractMetaMethod<C extends BaseContractLike | BaseContract, M extends keyof C['functions']> {
    constructor(
        readonly contract: C,
        readonly methodName: M,
        readonly callback: MetaMethodTypeHelper<C, M>['callback']
    ) {}

    send(overrides: Overrides = {}): MetaMethodTypeHelper<C, M>['functionReturnType'] {
        return this.callback(
            this.contract.functions[this.methodName as string] as MetaMethodTypeHelper<C, M>['functionMethod'],
            overrides
        ) as MetaMethodTypeHelper<C, M>['functionReturnType'];
    }

    callStatic(overrides: Overrides = {}): MetaMethodTypeHelper<C, M>['callStaticReturnType'] {
        return this.callback(
            this.contract.callStatic[this.methodName as string] as MetaMethodTypeHelper<C, M>['callStaticMethod'],
            overrides
        ) as MetaMethodTypeHelper<C, M>['callStaticReturnType'];
    }

    estimateGas(overrides: Overrides = {}): MetaMethodTypeHelper<C, M>['estimateGasReturnType'] {
        return this.callback(
            this.contract.estimateGas[this.methodName as string] as MetaMethodTypeHelper<C, M>['estimateGasMethod'],
            overrides
        ) as MetaMethodTypeHelper<C, M>['estimateGasReturnType'];
    }
}

export type MetaMethodType = 'send' | 'callStatic' | 'estimateGas' | 'meta-method';
export type MetaMethodReturnType<
    T extends MetaMethodType | undefined,
    C extends BaseContract,
    M extends keyof C['functions']
> = 'send' | undefined extends T
    ? MetaMethodTypeHelper<C, M>['functionReturnType']
    : 'callStatic' | undefined extends T
    ? MetaMethodTypeHelper<C, M>['callStaticReturnType']
    : 'estimateGas' | undefined extends T
    ? MetaMethodTypeHelper<C, M>['estimateGasReturnType']
    : 'meta-method' | undefined extends T
    ? Promise<ContractMetaMethod<C, M>>
    : never;

export function callMetaMethod<
    T extends MetaMethodType | undefined,
    C extends BaseContract,
    M extends keyof C['functions']
>(
    methodType: T,
    contract: C,
    methodName: M,
    callback: MetaMethodTypeHelper<C, M>['callback']
): MetaMethodReturnType<T, C, M> {
    const metaMethod = new ContractMetaMethod(contract, methodName, callback);
    if (methodType === 'meta-method') return metaMethod as any;
    if (methodType === 'callStatic') return metaMethod.callStatic() as any;
    if (methodType === 'estimateGas') return metaMethod.estimateGas() as any;
    return metaMethod.send() as any;
}
