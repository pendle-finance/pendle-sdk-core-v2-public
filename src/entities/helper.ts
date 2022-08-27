import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { abi as RouterStaticABI } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/RouterStatic.sol/RouterStatic.json';
import { BigNumber as BN, Contract, type providers } from 'ethers';
import {
    type ContractAddresses,
    CHAIN_ID,
    AVALANCHE_ADDRESSES,
    ETHEREUM_ADDRESSES,
    FUJI_ADDRESSES,
    MUMBAI_ADDRESSES,
    PERCENTAGE_DECIMALS,
    NATIVE_ADDRESS_0x00,
    NATIVE_ADDRESS_0xEE,
} from '../constants';
import { Address } from './types';

export function decimalFactor(decimals: number): BN {
    return BN.from(10).pow(decimals);
}

export function calcSlippedDownAmount(theoreticalAmount: BN, slippage: number): BN {
    InvalidSlippageError.verify(slippage);
    return theoreticalAmount
        .mul(decimalFactor(PERCENTAGE_DECIMALS).sub(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function calcSlippedUpAmount(theoreticalAmount: BN, slippage: number): BN {
    InvalidSlippageError.verify(slippage);
    return theoreticalAmount
        .mul(decimalFactor(PERCENTAGE_DECIMALS).add(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS))))
        .div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function getRouterStatic(provider: providers.Provider, chainId: number): RouterStatic {
    return new Contract(getContractAddresses(chainId).ROUTER_STATIC, RouterStaticABI, provider) as RouterStatic;
}

export function getContractAddresses(chainId: number): ContractAddresses {
    switch (chainId) {
        case CHAIN_ID.ETHEREUM:
            return ETHEREUM_ADDRESSES;
        case CHAIN_ID.AVALANCHE:
            return AVALANCHE_ADDRESSES;
        case CHAIN_ID.FUJI:
            return FUJI_ADDRESSES;
        case CHAIN_ID.MUMBAI:
            return MUMBAI_ADDRESSES;
        default:
            throw Error('Invalid Chain ID');
    }
}

export function isMainchain(chainId: number): boolean {
    return chainId === CHAIN_ID.ETHEREUM || chainId === CHAIN_ID.FUJI;
}

export function isSameAddress(address1: Address, address2: Address): boolean {
    return address1.toLowerCase() === address2.toLowerCase();
}

export function isNativeToken(address: Address): boolean {
    return isSameAddress(address, NATIVE_ADDRESS_0x00) || isSameAddress(address, NATIVE_ADDRESS_0xEE);
}

export class InvalidSlippageError extends Error {
    constructor() {
        super('Slippage must be a decimal value in the range [0, 1]');
    }

    static verify(slippage: number) {
        if (slippage < 0 || slippage > 1) throw new InvalidSlippageError();
    }
}

export class NoRouteFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoRouteFoundError';
    }

    static action(actionName: string, from: string, to: string) {
        return new NoRouteFoundError(`No route found to ${actionName} from ${from} to ${to}`);
    }
}
