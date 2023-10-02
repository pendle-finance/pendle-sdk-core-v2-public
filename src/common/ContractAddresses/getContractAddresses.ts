import { ContractAddresses } from './types';
import * as data from './data';
import { ChainId, CHAIN_ID_MAPPING } from '../ChainId';

export const CONTRACT_ADDRESSES = {
    [CHAIN_ID_MAPPING.ETHEREUM]: data.ETHEREUM_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.FUJI]: data.FUJI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.MUMBAI]: data.MUMBAI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.ARBITRUM]: data.ARBITRUM_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.BSC]: data.BSC_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.MANTLE]: data.MANTLE_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.OPTIMISM]: data.OPTIMISM_CORE_ADDRESSES,
} as const satisfies Record<ChainId, ContractAddresses>;

export function getContractAddresses<C extends ChainId>(chainId: C): (typeof CONTRACT_ADDRESSES)[C] {
    const res = CONTRACT_ADDRESSES[chainId];

    // // Not require here anymore, if we pass the correct type in TypeScript.
    // // For JavaScript user, there might be error only when accessing field of undefined.
    // if (res == undefined) {
    //     throw new PendleSdkError(`There is no default contract addresses for chain ${chainId}`);
    // }
    return res;
}
