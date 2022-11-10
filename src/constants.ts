import type { Address } from './entities';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';
import { constants as ethersConstants } from 'ethers';
import { toAddress } from './entities/helper';

export type ContractAddresses = {
    ROUTER: Address;
    ROUTER_STATIC: Address;
    PENDLE: Address;
    VEPENDLE: Address;
    VOTING_CONTROLLER?: Address;
};

export const PERCENTAGE_DECIMALS = 6;

export const CHAIN_ID = {
    ETHEREUM: 1,
    AVALANCHE: 43114,
    FUJI: 43113,
    MUMBAI: 80001,
} as const;

export type ChainId = typeof CHAIN_ID[keyof typeof CHAIN_ID];

// TODO: Update addresses after deployment
export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER: '0xRouter',
    ROUTER_STATIC: '0xRouterStatic',
    PENDLE: '0xPendle',
    VEPENDLE: '0xVEPENDLE',
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;

export const FUJI_ADDRESSES: ContractAddresses = {
    ROUTER: toAddress(FUJI_CORE_ADDRESSES.router),
    ROUTER_STATIC: toAddress(FUJI_CORE_ADDRESSES.routerStatic),
    PENDLE: toAddress(FUJI_CORE_ADDRESSES.PENDLE),
    VEPENDLE: toAddress(FUJI_CORE_ADDRESSES.vePendle),
    VOTING_CONTROLLER: toAddress(FUJI_CORE_ADDRESSES.votingController),
};

export const MUMBAI_ADDRESSES: ContractAddresses = {
    ROUTER: toAddress(MUMBAI_CORE_ADDRESSES.router),
    ROUTER_STATIC: toAddress(MUMBAI_CORE_ADDRESSES.routerStatic),
    PENDLE: toAddress(MUMBAI_CORE_ADDRESSES.PENDLE),
    VEPENDLE: toAddress(MUMBAI_CORE_ADDRESSES.vePendle),
};

export const CONTRACT_ADDRESSES: Record<ChainId, ContractAddresses> = {
    [CHAIN_ID.ETHEREUM]: ETHEREUM_ADDRESSES,
    [CHAIN_ID.AVALANCHE]: AVALANCHE_ADDRESSES,
    [CHAIN_ID.MUMBAI]: MUMBAI_ADDRESSES,
    [CHAIN_ID.FUJI]: FUJI_ADDRESSES,
} as const;

export const KYBER_API = {
    [CHAIN_ID.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID.AVALANCHE]: 'https://aggregator-api.kyberswap.com/avalanche/route/encode',
    [CHAIN_ID.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
} as const;

export const NATIVE_ADDRESS_0x00 = ethersConstants.AddressZero;

export const NATIVE_ADDRESS_0xEE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export const MULTICALL_ADDRESSES: Record<ChainId, Address> = {
    [CHAIN_ID.ETHEREUM]: '0x5ba1e12693dc8f9c48aad8770482f4739beed696',
    [CHAIN_ID.AVALANCHE]: '0x11b8399bc71e8b67a0f7cca2663612af1ca38536',
    [CHAIN_ID.FUJI]: '0x07e46d95cc98f0d7493d679e89e396ea99020185',
    [CHAIN_ID.MUMBAI]: '0x08411add0b5aa8ee47563b146743c13b3556c9cc',
} as const;
