import { constants as ethersConstants } from 'ethers';

/**
 * The `Address` type. Please use {@link toAddress} to cast a raw address to
 * this type.
 *
 * @remarks
 * This type is defined to avoid using raw string as address.
 * The address returned by a contract call often have mixed cases,
 * which sometimes causes bug in comparison.
 *
 * This type is an [Opaque](https://en.wikipedia.org/wiki/Opaque_data_type)
 * type with the help of a private unique symbol. Similar implementation
 * can be found in popular libraries such as
 * [ts-essentials](https://github.com/ts-essentials/ts-essentials/tree/master/lib/opaque).
 * We implemented our own, as the generated documentation are the IDE intellisense
 * are nicer than using the library.
 */
export type Address = `0x${string}` & { readonly [ADDRESS_OPAQUE]: 'pendle.sdk.address' };
declare const ADDRESS_OPAQUE: unique symbol;

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

export function isAddress(str: unknown): str is Address {
    return typeof str === 'string' && /^0x[0-9a-f]{40}$/.test(str);
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
export type NativeTokenAddress = typeof NATIVE_ADDRESS_0x00;

/**
 * Check if an address is a native token (which are {@link NATIVE_ADDRESS_0x00} and {@link NATIVE_ADDRESS_0xEE})
 * @param address
 * @returns
 */
export function isNativeToken(address: Address): boolean {
    return areSameAddresses(address, NATIVE_ADDRESS_0x00) || areSameAddresses(address, NATIVE_ADDRESS_0xEE);
}
