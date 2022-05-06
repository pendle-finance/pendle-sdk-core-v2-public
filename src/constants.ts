import type { Address } from './entities';

export type ContractAddresses = {
    ROUTER_STATIC: Address;
};

export const CHAIN_ID = {
    ETHEREUM: 1,
    AVALANCHE: 43114,
    KOVAN: 42,
};

// TODO: Update addresses after deployment
export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER_STATIC: '0xRouter',
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;

export const KOVAN_ADDRESSES: ContractAddresses = {
    ROUTER_STATIC: '0x304e2cdb93d820DC5f86D5FCaF2ccFd34E52e9C9',
};
