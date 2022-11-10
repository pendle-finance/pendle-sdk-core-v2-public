// Type helper
export type ConcatTuple<A, B> = A extends any[] ? (B extends any[] ? [...A, ...B] : never) : never;
export type GetField<Obj extends {}, Key, Default = never> = Key extends keyof Obj ? Obj[Key] : Default;
export type RemoveLastOptional<T extends any[]> = T extends [...infer Head, any?] ? Head : T;
export type AddOptional<T extends any[], P> = [...T, P?];

/**
 * The below utility types use infer instead of Parameters and ReturnType.
 *
 * Parameters and ReturnType will work fine IF Fn is concrete. If
 * Fn is not concrete, the Parameters and ReturnType could not be properly inferred.
 *
 * For example, the following code failed to inferred the type of the variable x
 *
 *      type A = {
 *          a: () => number;
 *      };
 *      function k<C extends A>() {
 *          type t = ReturnType<C['a']>;
 *          const x: t = 123;
 *          return x;
 *      }
 *
 * Even though we know then signature of A['a'], we actually does not know the signature of C['a'].
 * Considered the following type:
 *
 *      type B = A & {
 *          a: (y: string) => string;
 *      };
 *      console.log(k<B>());
 *
 * B is totally a valid subtype of A, and can even be used with the function k. We can concluded that
 * ReturnType is not concrete enough.
 *
 *
 * Using infer, we can get both parameters type and the return type, as they come **in pair**.
 * Parameters and ReturnType, on the other hand, are not.
 */
export type RemoveLastOptionalParam<Fn extends (...params: any[]) => any> = Fn extends (
    ...params: [...infer Head, any?]
) => infer R
    ? (...params: Head) => R
    : Fn;
export type AddParams<Fn extends (...params: any[]) => any, P extends any[]> = Fn extends (
    ...params: infer Params
) => infer R
    ? (...params: ConcatTuple<Params, P>) => R
    : Fn;

export type SyncReturnType<Fn extends (...params: any[]) => Promise<any>> = Awaited<ReturnType<Fn>>;

export type UnionOf<Types> = Types extends [infer Elm]
    ? Elm
    : Types extends [...infer Body, infer Last]
    ? UnionOf<Body> & Last
    : Types;

// function helpers

export function filterUniqueByField<Elm, F>(arr: Iterable<Elm>, fieldGetter: (elm: Elm) => F): Elm[] {
    const s = new Set<F>();
    const res: Elm[] = [];
    for (const elm of arr) {
        const field = fieldGetter(elm);
        if (s.has(field)) {
            continue;
        }
        s.add(field);
        res.push(elm);
    }
    return res;
}

export type Iterableify<T> = { [K in keyof T]: Iterable<T[K]> };
/**
 * Stolen from https://dev.to/chrismilson/zip-iterator-in-typescript-ldm
 *
 * Some common usages:
 * - Convert generator to array:  [...zip(a, b)] or Array.from(zip(a, b));
 * - Map element: Array.from(zip(a, b), mapFn);
 */
export function* zip<T extends Array<any>>(...toZip: Iterableify<T>): Generator<T> {
    const iterators = toZip.map((i) => i[Symbol.iterator]());
    while (true) {
        const results = iterators.map((i) => i.next());
        if (results.some(({ done }) => done)) {
            break;
        }
        yield results.map(({ value }) => value) as T;
    }
}

export function devLog(message?: any, ...optionalParams: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message, ...optionalParams);
    }
}
