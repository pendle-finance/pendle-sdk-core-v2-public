import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, Contract, type providers } from 'ethers';
import {
    CHAIN_ID,
    AVALANCHE_ADDRESSES,
    ETHEREUM_ADDRESSES,
    KOVAN_ADDRESSES,
    type ContractAddresses,
} from '../constants';
import { dummyABI } from '../dummy';

export const PERCENTAGE_DECIMALS = 6;

export function decimalFactor(decimals: number): string {
    return BN.from(10).pow(decimals).toString();
}

export function calcSlippedDownAmount(theoreticalAmount: BN, slippage: number): BN {
    return theoreticalAmount
        .mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).sub(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function calcSlippedUpAmount(theoreticalAmount: BN, slippage: number): BN {
    return theoreticalAmount
        .mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).add(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function getRouterStatic(provider: providers.Provider, chainId: number): RouterStatic {
    return new Contract(getContractAddresses(chainId).ROUTER_STATIC, dummyABI, provider) as RouterStatic;
}

export function getContractAddresses(chainId: number): ContractAddresses {
    switch (chainId) {
        case CHAIN_ID.ETHEREUM:
            return ETHEREUM_ADDRESSES;
        case CHAIN_ID.AVALANCHE:
            return AVALANCHE_ADDRESSES;
        case CHAIN_ID.KOVAN:
            return KOVAN_ADDRESSES;
        default:
            throw Error('Invalid Chain ID');
    }
}
