import { toAddress, Address } from '../../../src';

export type ShallowToAddressType<T> = T extends string
    ? Address
    : T extends {}
    ? { [Key in keyof T]: ShallowToAddressType<T[Key]> }
    : T;

export function shallowToAddress<T>(obj: T): ShallowToAddressType<T> {
    if (typeof obj === 'string') {
        return toAddress(obj) as any;
    }
    if (Array.isArray(obj)) {
        return obj.map(shallowToAddress) as any;
    }
    if (typeof obj !== 'object') {
        return obj as any;
    }
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as {})) {
        res[key] = shallowToAddress(value);
    }
    return res as any;
}
