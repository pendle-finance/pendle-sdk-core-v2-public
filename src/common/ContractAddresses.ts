import ETHEREUM_CORE_ADDRESSES from '@pendle/core-v2/deployments/1-core.json';
import { Address, toAddress } from './Address';
import { CHAIN_ID_MAPPING, ChainId } from './ChainId';

/**
 * Group of Pendle's contract addresses by name
 * @see CONTRACT_ADDRESSES
 */
export type ContractAddresses = {
    ROUTER: Address;
    ROUTER_STATIC: Address;
    PENDLE: Address;
    VEPENDLE: Address;
    VOTING_CONTROLLER?: Address;
};

const DUMMY_ADDRESSES: ContractAddresses = {
    ROUTER: '0xRouter',
    ROUTER_STATIC: '0xRouterStatic',
    PENDLE: '0xPendle',
    VEPENDLE: '0xVEPENDLE',
};

// TODO: Update addresses after deployment
export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER: toAddress(ETHEREUM_CORE_ADDRESSES.router),
    ROUTER_STATIC: toAddress(ETHEREUM_CORE_ADDRESSES.routerStatic),
    PENDLE: toAddress(ETHEREUM_CORE_ADDRESSES.PENDLE),
    VEPENDLE: toAddress(ETHEREUM_CORE_ADDRESSES.vePendle),
    VOTING_CONTROLLER: toAddress(ETHEREUM_CORE_ADDRESSES.votingController),
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;

export const FUJI_ADDRESSES: ContractAddresses = DUMMY_ADDRESSES;

export const MUMBAI_ADDRESSES: ContractAddresses = DUMMY_ADDRESSES;

/**
 * Contract addresses by chain id
 */
export const CONTRACT_ADDRESSES: Record<ChainId, ContractAddresses> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: ETHEREUM_ADDRESSES,
    [CHAIN_ID_MAPPING.AVALANCHE]: AVALANCHE_ADDRESSES,
    [CHAIN_ID_MAPPING.MUMBAI]: MUMBAI_ADDRESSES,
    [CHAIN_ID_MAPPING.FUJI]: FUJI_ADDRESSES,
} as const;

export function getContractAddresses(chainId: ChainId): ContractAddresses {
    return CONTRACT_ADDRESSES[chainId];
}
