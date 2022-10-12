import {
    Contract,
    BaseContract,
    type ContractInterface,
    type ContractFunction,
    Signer,
    providers,
    BigNumber as BN,
} from 'ethers';
import { Address, NetworkConnection } from './types';
import { PendleSdkError, EthersJsError, GasEstimationError } from './errors';

export type Provider = providers.Provider;

const ORIGINAL_CONTRACT: unique symbol = Symbol('original-contract');
export interface BaseContractLike<T extends BaseContract = Contract> {
    address: Address;
    provider: T['provider'];
    signer: T['signer'];
    interface: T['interface'];
    [ORIGINAL_CONTRACT]?: T;

    functions: T['functions'];
    callStatic: T['callStatic'];
    estimateGas: T['estimateGas'];
    // TODO other fields

    connect(signerOrProvider: string | Signer | Provider): this;
    attach(addressOrName: string): this;
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

export function wrapContractObject<T extends Contract>(contract: ContractLike<T>): ContractLike<T> {
    if (contract[ORIGINAL_CONTRACT]) {
        // contract is already wrapped.
        return contract;
    }

    // Typing here just to make sure all the fields exist
    const baseResult: Record<keyof BaseContractLike, any> = {
        [ORIGINAL_CONTRACT]: contract,
        address: contract.address,
        provider: contract.provider,
        signer: contract.signer,
        interface: contract.interface,
        functions: wrapFunctions(contract.functions),
        callStatic: wrapFunctions(contract.callStatic),
        estimateGas: wrapFunctions(contract.estimateGas, wrapEstimateGasFunction),
        connect(signerOrProvider: string | Signer | Provider) {
            return wrapContractObject(contract.connect(signerOrProvider));
        },
        attach(addressOrName: string) {
            return wrapContractObject(contract.attach(addressOrName));
        },
    };

    Object.defineProperty(baseResult, ORIGINAL_CONTRACT, {
        enumerable: false,
        value: contract,
    });

    const result: any = baseResult;

    for (const key of Object.keys(contract.functions)) {
        if (Object.hasOwn(contract, key)) {
            result[key] = wrapFunction(contract[key] as ContractFunction);
        }
    }

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
): ContractLike<T> {
    let result: ContractLike<T>;
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

export function getInnerContract<T extends Contract>(wrappedContract: ContractLike<T>): T {
    const innerContract = wrappedContract[ORIGINAL_CONTRACT];
    if (!innerContract) {
        throw new Error('contract argument must be a wrapped contract');
    }
    return innerContract;
}
