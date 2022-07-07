import type { Address } from './entities';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';

export type ContractAddresses = {
    ROUTER: Address;
    ROUTER_STATIC: Address;
};

export const CHAIN_ID = {
    ETHEREUM: 1,
    AVALANCHE: 43114,
    FUJI: 43113,
    MUMBAI: 80001,
};

// TODO: Update addresses after deployment
export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER: '0xRouter',
    ROUTER_STATIC: '0xRouterStatic',
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;

export const FUJI_ADDRESSES: ContractAddresses = {
    ROUTER: FUJI_CORE_ADDRESSES.router,
    ROUTER_STATIC: FUJI_CORE_ADDRESSES.routerStatic,
};

export const MUMBAI_ADDRESSES: ContractAddresses = {
    ROUTER: MUMBAI_CORE_ADDRESSES.router,
    ROUTER_STATIC: MUMBAI_CORE_ADDRESSES.routerStatic,
};
