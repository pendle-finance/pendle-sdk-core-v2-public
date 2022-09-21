import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { abi as RouterStaticABI } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/RouterStatic.sol/RouterStatic.json';
import { Contract } from 'ethers';
import type { providers } from 'ethers';
import type { ContractAddresses } from '../constants';
import { CHAIN_ID, NATIVE_ADDRESS_0x00, NATIVE_ADDRESS_0xEE, CONTRACT_ADDRESSES, KYBER_API } from '../constants';
import { Address, ChainId, MainchainId } from '../types';

export function getRouterStatic(provider: providers.Provider, chainId: ChainId): RouterStatic {
    return new Contract(getContractAddresses(chainId).ROUTER_STATIC, RouterStaticABI, provider) as RouterStatic;
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
