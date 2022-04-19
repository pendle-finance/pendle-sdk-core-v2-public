import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, Contract, type providers } from 'ethers';
import { CHAIN_ID, AVALANCHE_ADDRESSES, ETHEREUM_ADDRESSES, type ContractAddresses } from '../constants';
import { dummyABI } from '../dummy';

export const PERCENTAGE_DECIMALS = 6;

export function decimalFactor(decimals: number): string {
    return BN.from(10).pow(decimals).toString();
}

export function calcSlippedDownAmount(theoriticalAmount: BN, slippage: number): BN {
    return theoriticalAmount
        .mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).sub(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function calcSlippedUpAmount(theoriticalAmount: BN, slippage: number): BN {
    return theoriticalAmount
        .mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).add(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function getContractAddresses(chainId: number): ContractAddresses {
    switch (chainId) {
        case CHAIN_ID.ETHEREUM:
            return ETHEREUM_ADDRESSES;
        case CHAIN_ID.AVALANCHE:
            return AVALANCHE_ADDRESSES;
        default:
            throw Error('Invalid Chain ID');
    }
}

export function getRouterStatic(provider: providers.Provider, chainId: number): RouterStatic {
    return new Contract(getContractAddresses(chainId).ROUTER_STATIC, dummyABI, provider) as RouterStatic;
}
