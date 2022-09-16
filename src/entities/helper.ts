import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import { abi as RouterStaticABI } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/RouterStatic.sol/RouterStatic.json';
import { BigNumber as BN, Contract, constants as ethersConstants } from 'ethers';
import type { BigNumberish } from 'ethers';
import type { providers } from 'ethers';
import type { ContractAddresses } from '../constants';
import {
    CHAIN_ID,
    PERCENTAGE_DECIMALS,
    NATIVE_ADDRESS_0x00,
    NATIVE_ADDRESS_0xEE,
    CONTRACT_ADDRESSES,
    KYBER_API,
} from '../constants';
import { Address, ChainId, MainchainId } from '../types';

export function decimalFactor(decimals: number): BN {
    return BN.from(10).pow(decimals);
}

export function calcSlippedDownAmount(theoreticalAmount: BN, slippage: number): BN {
    return bnSafeClamp(
        theoreticalAmount
            .mul(decimalFactor(PERCENTAGE_DECIMALS).sub(Math.trunc(slippage * 10 ** PERCENTAGE_DECIMALS)))
            .div(decimalFactor(PERCENTAGE_DECIMALS))
    );
}

export function calcSlippedUpAmount(theoreticalAmount: BN, slippage: number): BN {
    return bnSafeClamp(
        theoreticalAmount
            .mul(decimalFactor(PERCENTAGE_DECIMALS).add(Math.trunc(slippage * 10 ** PERCENTAGE_DECIMALS)))
            .div(decimalFactor(PERCENTAGE_DECIMALS))
    );
}

export function getRouterStatic(provider: providers.Provider, chainId: ChainId): RouterStatic {
    return new Contract(getContractAddresses(chainId).ROUTER_STATIC, RouterStaticABI, provider) as RouterStatic;
}

export function getContractAddresses(chainId: ChainId): ContractAddresses {
    return CONTRACT_ADDRESSES[chainId];
}

export function isMainchain(chainId: ChainId): chainId is MainchainId {
    return chainId === CHAIN_ID.ETHEREUM || chainId === CHAIN_ID.FUJI;
}

export function isKyberSupportedChain(chainId: ChainId): chainId is keyof typeof KYBER_API {
    return chainId in KYBER_API;
}

export function isSameAddress(address1: Address, address2: Address): boolean {
    return address1.toLowerCase() === address2.toLowerCase();
}

export function isNativeToken(address: Address): boolean {
    return isSameAddress(address, NATIVE_ADDRESS_0x00) || isSameAddress(address, NATIVE_ADDRESS_0xEE);
}

export function bnMax(a: BigNumberish, b: BigNumberish): BigNumberish {
    return BN.from(a).gt(b) ? a : b;
}

export function bnMin(a: BigNumberish, b: BigNumberish): BigNumberish {
    return BN.from(a).lt(b) ? a : b;
}

/**
 * Precondition: lower <= upper.
 */
export function bnClamp(num: BigNumberish, lower: BigNumberish, upper: BigNumberish): BN {
    num = BN.from(num);
    return num.lt(lower) ? BN.from(lower) : num.gt(upper) ? BN.from(upper) : num;
}

export function bnSafeClamp(num: BigNumberish) {
    return bnClamp(num, ethersConstants.Zero, ethersConstants.MaxUint256);
}
