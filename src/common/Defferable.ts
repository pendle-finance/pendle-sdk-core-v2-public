import { Promisable } from 'type-fest';

export type Deferrable<T> = T extends (...params: any[]) => any ? never : Promisable<T> | (() => Promisable<T>);

export async function unwrapDeferrable<T>(x: Deferrable<T>): Promise<T>;
export async function unwrapDeferrable(x: unknown): Promise<unknown> {
    if (typeof x === 'function') return x() as unknown;
    return x;
}
