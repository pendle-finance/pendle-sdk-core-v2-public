// Type helper

// These imports are only for documentation

/**
 * Concatenate two tuple.
 *
 * @remarks
 * This type should always be used when concatenating 2 tuples.
 *
 * In the current version of Typescript (4.8.4), tuple's members have labels,
 * but there is no accessor to those labels. We often want to preserve the
 * labels (the most used case is for the argument named of a function),
 * while transforming the tuple. But most of the times, type transformation
 * does not preserve the label.
 *
 * @example
 * ```ts
 * type MyCoolTuple = [x: number, y: string];
 * type UnnamedTuple = [...MyCoolTuple, boolean];
 * type NamedTuple = [...MyCoolTuple, ...[z: boolean]];
 *
 * // type NonExample = [...MyCoolTuple, z: boolean];
 * ```
 * Here, `UnNamedTuple` will be `[number, string, boolean]`, while `NamedTuple` will be
 * `[x: number, y: string, z: boolean]`.
 *
 * Link to the playground is [here](https://www.typescriptlang.org/play?#code/C4TwDgpgBAsiDCB7RAbAKgVzC6BeKA2gB4BcUAdhgLYBGEATgDRQhkDOw9AluQOYC6AbgBQoSFACq5cgEMqEACaZseQgDoNcJKmU5mNZDhnkho8NABycxbtUENarYdvMHBAF5kDqCMf6nhAHpAqDFLRHIAUSI5FSh8e00EZyw9KE8obyMTQSA)
 *
 * Another reason to use this type, is for type-safety, as we force the usage of
 * the tuple.
 */
export type ConcatTuple<A extends any[], B extends any[]> = [...A, ...B];

/**
 * Dynamically get the field type, even if `Key` is not a key of `Obj`.
 *
 * @remarks
 * Sometimes, when defining a new type, `tsc` could not infer the initial type of
 * `Obj` or `Key`. For example, {@link ContractMethodNames}
 * for the plain [Contract] is forced to be `never`.
 * This type is used to bypass the initial typing, and get the actual type when
 * it is used.
 *
 * [Contract]: https://docs.ethers.io/v5/api/contract/contract/
 *
 * @typeParam Obj - the object type to query.
 * @typeParam Key - the key to query. Key is not forced to be `keyof Obj`.
 * @typeParam Default - the type to return if in reality, Key is not `keyof Obj`.
 * @returns Obj[key] if Key is `keyof Obj`. Otherwise `Default` is returned.
 */
export type GetField<Obj extends {}, Key, Default = never> = Key extends keyof Obj ? Obj[Key] : Default;
/**
 * Remove the last optional fields of a tuple.
 *
 * @remarks
 * An example usage of this type is to remove the overrides parameters of the contract methods,
 * then add our own type/overrides.
 */
export type RemoveLastOptional<T extends any[]> = T extends [...infer Head, any?] ? Head : T;

/**
 * @deprecated
 * Use {@link ConcatTuple} instead, like `ConcatTuple<T, [name?: P]>`.
 */
export type AddOptional<T extends any[], P> = [...T, P?];

/**
 * @remarks
 * The following are note for the implementation.
 *
 * `Parameters` and `ReturnType` types will work fine **IF** `Fn` is a concrete
 * type. If `Fn` is not concrete (passed in as a type parameter), the `Parameters`
 * and `ReturnType` could not be properly inferred.
 *
 * For example, the following code **failed** to inferred the type of the variable x
 * ```
 * type A = {
 *     a: () => number;
 * };
 * function k<C extends A>() {
 *     type t = ReturnType<C['a']>;
 *     const x: t = 123;
 *     return x;
 * }
 * ```
 *
 * Even though we know then signature of `A['a']`, we actually does not know the
 * signature of `C['a']`.  Considered the following type:
 * ```
 * type B = A & {
 *     a: (y: string) => string;
 * };
 * console.log(k<B>());
 * ```
 *
 * `B` is totally a valid subtype of A, and can even be used with the function
 * k. We can concluded that ReturnType is not concrete enough.
 *
 * Using infer, we can get both parameters type and the return type, as they
 * come **in pair**. `Parameters` and `ReturnType`, on the other hand, are not.
 */
export type RemoveLastOptionalParam<Fn extends (...params: any[]) => any> = Fn extends (
    ...params: [...infer Head, any?]
) => infer R
    ? (...params: Head) => R
    : Fn;

/**
 * @remarks
 * See {@link RemoveLastOptionalParam} for note on the implementation.
 */
export type AddParams<Fn extends (...params: any[]) => any, P extends any[]> = Fn extends (
    ...params: infer Params
) => infer R
    ? (...params: ConcatTuple<Params, P>) => R
    : Fn;

/**
 * Shorthand for `Awaited<ReturnType<Fn>>`.
 */
export type SyncReturnType<Fn extends (...params: any[]) => Promise<any>> = Awaited<ReturnType<Fn>>;

/**
 * Union of all types of a given tuple `Types`.
 */
export type UnionOf<Types> = Types extends [infer Elm]
    ? Elm
    : Types extends [...infer Body, infer Last]
    ? UnionOf<Body> & Last
    : Types;

// function helpers

/**
 * Return an array of `Elm`, that is a **subset** of `arr`, and all the elements
 * are pair-wise distinct by their values given by `fieldGetter`.
 *
 * @typeParam Elm - the element type.
 * @typeParam F - the field type, or value type of `Elm` for comparison. Note that
 *      the type should be identity-comparable, because this implementation uses
 *      Javascript's Set.
 * @param arr - the array to filter.
 * @param fieldGetter - the getter for the field, but can be arbitrary a transformer.
 * @returns the filtered array.
 */
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
 * @remarks
 * Some common usages:
 * - Convert generator to array:
 *  ```ts
 * const firstWay = [...zip(a, b)];
 * const secondWay = Array.from(zip(a, b));
 * ```
 *
 * - Map element:
 * ```ts
 * const mappedArray = Array.from(zip(a, b), mapFn);
 * ```
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

/**
 * Log the `message` when `process.env.NODE_ENV !== 'production'`.
 */
export function devLog(message?: any, ...optionalParams: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message, ...optionalParams);
    }
}

/**
 * @remarks
 * The results might be un ordered.
 * @returns pairs of arrays. The first array being the succesful results, and the second ones is the errors
 * of the failing ones.
 */
export async function promiseAllWithErrors<T, ErrorType = Error>(promises: Promise<T>[]): Promise<[T[], ErrorType[]]> {
    const results: T[] = [];
    const errors: ErrorType[] = [];

    await Promise.all(promises.map((promise) => promise.then((r) => results.push(r)).catch((e) => errors.push(e))));
    return [results, errors];
}
