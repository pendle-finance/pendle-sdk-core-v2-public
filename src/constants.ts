import type { Address } from './entities';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';
import { constants as ethersConstants } from 'ethers';

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
};

// TODO: Update addresses after deployment
export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER: '0xRouter',
    ROUTER_STATIC: '0xRouterStatic',
    PENDLE: '0xPendle',
    VEPENDLE: '0xVEPENDLE',
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;

export const FUJI_ADDRESSES: ContractAddresses = {
    ROUTER: FUJI_CORE_ADDRESSES.router,
    ROUTER_STATIC: FUJI_CORE_ADDRESSES.routerStatic,
    PENDLE: FUJI_CORE_ADDRESSES.PENDLE,
    VEPENDLE: FUJI_CORE_ADDRESSES.vePendle,
    VOTING_CONTROLLER: FUJI_CORE_ADDRESSES.votingController,
};

export const MUMBAI_ADDRESSES: ContractAddresses = {
    ROUTER: MUMBAI_CORE_ADDRESSES.router,
    ROUTER_STATIC: MUMBAI_CORE_ADDRESSES.routerStatic,
    PENDLE: MUMBAI_CORE_ADDRESSES.PENDLE,
    VEPENDLE: MUMBAI_CORE_ADDRESSES.vePendle,
};

export const KYBER_API = {
    [CHAIN_ID.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID.AVALANCHE]: 'https://aggregator-api.kyberswap.com/avalanche/route/encode',
    [CHAIN_ID.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
} as const;

export const NATIVE_ADDRESS_0x00 = ethersConstants.AddressZero;

export const NATIVE_ADDRESS_0xEE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';