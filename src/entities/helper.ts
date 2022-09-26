import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { abi as RouterStaticABI } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/RouterStatic.sol/RouterStatic.json';
import { Contract, ContractInterface } from 'ethers';
import type { ContractAddresses } from '../constants';
import { CHAIN_ID, NATIVE_ADDRESS_0x00, NATIVE_ADDRESS_0xEE, CONTRACT_ADDRESSES, KYBER_API } from '../constants';
import { Address, ChainId, MainchainId, NetworkConnection } from '../types';
import { PendleSdkError } from '../errors';

export function createContractObject<T extends Contract = Contract>(
    address: Address,
    abi: ContractInterface,
    networkConnection: NetworkConnection
): T {
    if (networkConnection.signer == undefined) {
        return new Contract(address, abi, networkConnection.provider) as T;
    }
    if (networkConnection.provider != undefined && networkConnection.provider !== networkConnection.signer.provider) {
        throw new PendleSdkError(
            'For contract creation, networkConnection.provider should be the same as networkConnection.signer.provider'
        );
    }
    return new Contract(address, abi, networkConnection.signer) as T;
}

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

export function getRouterStatic(networkConnection: NetworkConnection, chainId: ChainId): RouterStatic {
    return createContractObject<RouterStatic>(
        getContractAddresses(chainId).ROUTER_STATIC,
        RouterStaticABI,
        networkConnection
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
