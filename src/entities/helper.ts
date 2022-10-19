import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { abi as RouterStaticABI } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/RouterStatic.sol/RouterStatic.json';
import type { ContractAddresses } from '../constants';
import { CHAIN_ID, NATIVE_ADDRESS_0x00, NATIVE_ADDRESS_0xEE, CONTRACT_ADDRESSES, KYBER_API } from '../constants';
import { Address, ChainId, MainchainId, NetworkConnection } from '../types';
import { PendleSdkError } from '../errors';
import { createContractObject, WrappedContract, WrappedContractConfig } from '../contractHelper';

/**
 * This is a decorator that check if this.networkConnection.signer existed
 * before actually performing the operation.
 *
 * Normally ethers.js will throw an error anyway, but this decorator can also
 * be used as a comment.
 */
export function requiresSigner(
    _target: any,
    methodName: string,
    descriptor: TypedPropertyDescriptor<
        (this: { readonly networkConnection: NetworkConnection }, ...args: any[]) => any
    >
) {
    const actualMethod = descriptor.value!;
    descriptor.value = function (this: { networkConnection: NetworkConnection }) {
        if (this.networkConnection.signer == undefined) {
            throw new PendleSdkError(`A singer is required to perform #${methodName}`);
        }
        return actualMethod.apply(this, arguments as unknown as any[]);
    };
}

export function getRouterStatic(
    networkConnection: NetworkConnection,
    chainId: ChainId,
    config?: WrappedContractConfig
): WrappedContract<RouterStatic> {
    return createContractObject<RouterStatic>(
        getContractAddresses(chainId).ROUTER_STATIC,
        RouterStaticABI,
        networkConnection,
        config
    );
}

export function getContractAddresses(chainId: ChainId): ContractAddresses {
    return CONTRACT_ADDRESSES[chainId];
}

export function isMainchain(chainId: ChainId): chainId is MainchainId {
    return chainId === CHAIN_ID.ETHEREUM || chainId === CHAIN_ID.FUJI;
}

export function isKyberSupportedChain(chainId: ChainId): chainId is keyof typeof KYBER_API {
    return chainId in KYBER_API;
}

export function isSameAddress(address1: Address, address2: Address): boolean {
    return address1.toLowerCase() === address2.toLowerCase();
}

export function isNativeToken(address: Address): boolean {
    return isSameAddress(address, NATIVE_ADDRESS_0x00) || isSameAddress(address, NATIVE_ADDRESS_0xEE);
}

export function filterUniqueByField<Elm, F>(arr: Iterable<Elm>, fieldGetter: (elm: Elm) => F): Elm[] {
    const s = new Set<F>();
    const res: Elm[] = [];
    for (const elm of arr) {
        const field = fieldGetter(elm);
        if (s.has(field)) {
            continue;
        }
        s.add(field);
        res.push(elm);
    }
    return res;
}

export type Iterableify<T> = { [K in keyof T]: Iterable<T[K]> };
/**
 * Stolen from https://dev.to/chrismilson/zip-iterator-in-typescript-ldm
 *
 * Some common usages:
 * - Convert generator to array:  [...zip(a, b)] or Array.from(zip(a, b));
 * - Map element: Array.from(zip(a, b), mapFn);
 */
export function* zip<T extends Array<any>>(...toZip: Iterableify<T>): Generator<T> {
    const iterators = toZip.map((i) => i[Symbol.iterator]());
    while (true) {
        const results = iterators.map((i) => i.next());
        if (results.some(({ done }) => done)) {
            break;
        }
        yield results.map(({ value }) => value) as T;
    }
}
