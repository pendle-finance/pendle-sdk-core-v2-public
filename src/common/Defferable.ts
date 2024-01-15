import { Promisable } from 'type-fest';

export class LazyDeferrable<T> {
    private cacheResult: Promisable<T> | undefined = undefined;
    protected constructor(readonly invoker: () => Promisable<T>) {}

    static create<T>(invoker: () => Promisable<T>) {
        return new LazyDeferrable(invoker);
    }

    unwrap(): Promisable<T> {
        return (this.cacheResult ??= this.invoker());
    }
}

export type Deferrable<T> = Promisable<T> | LazyDeferrable<T>;

export async function unwrapDeferrable<T>(x: Deferrable<T>): Promise<T> {
    if (x instanceof LazyDeferrable) return x.unwrap();
    return x;
}
