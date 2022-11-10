import { constants as ethersConstants } from 'ethers';

export type Address = `0x${string}`;

/**
 * Convert a raw address to Pendle SDK's Address for type safety.
 */
export function toAddress(rawAddress: string): Address {
    return rawAddress.toLowerCase() as Address;
}

export function toAddresses(rawAddresses: string[]): Address[] {
    return rawAddresses.map(toAddress);
}

export function isSameAddress(address1: Address, address2: Address): boolean {
    return address1.toLowerCase() === address2.toLowerCase();
}

export function isNativeToken(address: Address): boolean {
    return isSameAddress(address, NATIVE_ADDRESS_0x00) || isSameAddress(address, NATIVE_ADDRESS_0xEE);
}

export const NATIVE_ADDRESS_0x00 = ethersConstants.AddressZero;

export const NATIVE_ADDRESS_0xEE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
