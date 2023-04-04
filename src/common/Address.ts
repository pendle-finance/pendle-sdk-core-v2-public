import { constants as ethersConstants } from 'ethers';
import { Opaque } from 'ts-essentials';

/**
 * @remarks
 * This type is defined to avoid using raw string as address.
 * The address returned by a contract call often have mixed cases,
 * which sometimes causes bug in comparison.
 *
 * Even though it only checks if the string begins with `0x`, we are
 * still sure that the address is not a raw string.
 *
 * Use {@link toAddress} to convert a raw address to this type.
 */
export type Address = Opaque<`0x${string}`, 'pendle.sdk.Address'>;

/**
 * Convert a raw address to Pendle SDK's {@link Address} for type safety.
 * @remarks
 * Note that this function **does not** validate the given string.
 *
 * @returns The converted address. The result will be in **lowercase**.
 */
export function toAddress(rawAddress: string): Address {
    return rawAddress.toLowerCase() as Address;
}

/**
 * Convert multiple raw addresses to {@link Address}.
 * @returns
 */
export function toAddresses(rawAddresses: string[]): Address[] {
    return rawAddresses.map(toAddress);
}

/**
 * Convert a raw address to {@link Address} or undefined.
 * @returns
 * - The converted address if the given string is not undefined.
 * - undefined if the given string is undefined.
 */
export function toAddressOrUndefined(rawAddress: string | undefined): Address | undefined {
    return rawAddress == undefined ? undefined : toAddress(rawAddress);
}

/**
 * Check if two given address are the same
 * @param address1
 * @param address2
 * @returns true if two address are the same.
 */
export function areSameAddresses(address1: Address, address2: Address): boolean {
    return address1.toLowerCase() === address2.toLowerCase();
}

export const NATIVE_ADDRESS_0x00 = toAddress(ethersConstants.AddressZero);

export const NATIVE_ADDRESS_0xEE = toAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');

/**
 * Union type of native tokens' address
 */
export type NativeTokenAddress = typeof NATIVE_ADDRESS_0x00 | typeof NATIVE_ADDRESS_0xEE;

/**
 * Check if an address is a native token (which are {@link NATIVE_ADDRESS_0x00} and {@link NATIVE_ADDRESS_0xEE})
 * @param address
 * @returns
 */
export function isNativeToken(address: Address): address is NativeTokenAddress {
    return areSameAddresses(address, NATIVE_ADDRESS_0x00) || areSameAddresses(address, NATIVE_ADDRESS_0xEE);
}
