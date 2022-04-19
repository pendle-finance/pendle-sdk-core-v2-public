import type { Address } from './entities';
import { BigNumber as BN } from 'ethers';

export const INF = BN.from(2).pow(256).sub(1);

export type ContractAddresses = {
    ROUTER_STATIC: Address;
};

export const CHAIN_ID = {
    ETHEREUM: 1,
    AVALANCHE: 43114,
};

export const ETHEREUM_ADDRESSES: ContractAddresses = {
    ROUTER_STATIC: '0xRouter',
};

export const AVALANCHE_ADDRESSES: ContractAddresses = ETHEREUM_ADDRESSES;
