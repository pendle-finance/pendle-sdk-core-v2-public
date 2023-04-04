import { AnyArray, AnyFunction, Tuple, AsyncOrSync, AsyncOrSyncType } from 'ts-essentials';
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
export type ConcatTuple<A extends AnyArray, B extends AnyArray> = [...A, ...B];

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
export type GetField<Obj extends object, Key, Default = never> = Key extends keyof Obj ? Obj[Key] : Default;
/**
 * Remove the last optional fields of a tuple.
 *
 * @remarks
 * An example usage of this type is to remove the overrides parameters of the contract methods,
 * then add our own type/overrides.
 */
export type RemoveLastOptional<T extends AnyArray> = T extends [...infer Head, unknown?] ? Head : T;

/**
 * @deprecated
 * Use {@link ConcatTuple} instead, like `ConcatTuple<T, [name?: P]>`.
 */
export type AddOptional<T extends AnyArray, P> = [...T, P?];

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
export type RemoveLastOptionalParam<Fn extends AnyFunction> = Fn extends (
    ...params: [...infer Head, unknown?]
) => infer R
    ? (...params: Head) => R
    : Fn;

/**
 * @remarks
 * See {@link RemoveLastOptionalParam} for note on the implementation.
 */
export type AddParams<Fn extends AnyFunction, P extends Tuple> = Fn extends (...params: infer Params) => infer R
    ? (...params: ConcatTuple<Params, P>) => R
    : Fn;

/**
 * Shorthand for `Awaited<ReturnType<Fn>>`.
 */
export type SyncReturnType<Fn extends AnyFunction<unknown[], AsyncOrSync<unknown>>> = AsyncOrSyncType<ReturnType<Fn>>;

/**
 * Union of all types of a given tuple `Types`.
 */
export type UnionOf<Types> = Types extends [infer Elm]
    ? Elm
    : Types extends [...infer Body, infer Last]
    ? UnionOf<Body> & Last
    : Types;

// https://stackoverflow.com/a/52490977
export type FixedLengthTuple<T, Length extends number> = Length extends Length
    ? number extends Length
        ? T[]
        : _FixedLengthTupleOf<T, Length, []>
    : never;
type _FixedLengthTupleOf<T, N extends number, R extends AnyArray> = R['length'] extends N
    ? R
    : _FixedLengthTupleOf<T, N, [T, ...R]>;

export type If<Condition extends boolean, TrueType, FalseType = undefined> = Condition extends true
    ? TrueType
    : Condition extends false
    ? FalseType
    : TrueType | FalseType;

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
export function* zip<T extends unknown[]>(...toZip: Iterableify<T>): Generator<T> {
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
export function devLog(message?: unknown, ...optionalParams: AnyArray): void {
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

export type SyncUpCheckpointFn = (id: number) => Promise<void>;

// Consideration: add timeout?
function createSyncUpCheckpointFn(entriesCount: number): SyncUpCheckpointFn {
    const awaitedEntries = Array.from({ length: entriesCount }, () => false);
    let awaitedEntriesCount = 0;
    let promiseResolve: () => void;
    const curPromise = new Promise<void>((resolve) => {
        promiseResolve = resolve;
    });
    return (id: number) => {
        if (awaitedEntries[id] === false) {
            awaitedEntries[id] = true;
            ++awaitedEntriesCount;
            if (awaitedEntriesCount === entriesCount) {
                promiseResolve();
            }
        }
        return curPromise;
    };
}

export function mapPromisesToSyncUp<SyncUpCheckpointCount extends number, ArrayToMap extends any[], Res>(
    syncUpCheckpointCount: SyncUpCheckpointCount,
    arr: ArrayToMap,
    fn: (
        syncUpCheckpoints: FixedLengthTuple<SyncUpCheckpointFn, SyncUpCheckpointCount>,
        elm: ArrayToMap[number],
        index: number
    ) => Promise<Res>
): Promise<Res>[] {
    const syncUpCheckpointFns = Array.from({ length: syncUpCheckpointCount }, () =>
        createSyncUpCheckpointFn(arr.length)
    ) as FixedLengthTuple<SyncUpCheckpointFn, SyncUpCheckpointCount>;
    return arr.map(async (elm, index) => {
        try {
            return await fn(syncUpCheckpointFns, elm, index);
        } finally {
            // call/re-call all checkpoint fn to not block the others
            void Promise.all(syncUpCheckpointFns.map((fn) => fn(index)));
        }
    });
}

export type StructureOfArrays<StructureSlice extends object> = {
    [key in keyof StructureSlice]: StructureSlice[key][];
};
export type ArrayOfStructures<Structure extends object> = Structure[];

export type ArrayOrStructure<T extends object> = StructureOfArrays<T> | ArrayOfStructures<T>;

export function toArrayOfStructures<T extends object>(structureOfArrays: StructureOfArrays<T>): ArrayOfStructures<T> {
    const keys = Object.keys(structureOfArrays) as Array<keyof T>;
    if (keys.length === 0) return [];
    const length = structureOfArrays[keys[0]].length;
    const res: ArrayOfStructures<T> = Array.from({ length }, () => ({} as T));

    for (const key of keys) {
        const array = structureOfArrays[key];
        if (array.length !== length) {
            throw new Error('Structure of array has mismatch length.');
        }
        array.forEach((value, index) => (res[index][key] = value));
    }

    return res;
}

export function toStructureOfArray<T extends object>(arrayOfStructures: ArrayOfStructures<T>): StructureOfArrays<T> {
    const res: StructureOfArrays<T> = {} as any;

    for (const elm of arrayOfStructures) {
        for (const [key, value] of Object.entries(elm) as [keyof T, T[keyof T]][]) {
            if (!(key in res)) {
                res[key] = [];
            }
            res[key].push(value);
        }
    }

    return res;
}

// Disable as the following helper use dynamic typing a lot
/* eslint-disable */

/**
 * Implementation for caching result of a function that accepts no arguments.
 * @privateRemarks
 * Rough test with usage in [this playground](https://www.typescriptlang.org/play?#code/AQMwrgdgxgLglgewsKAnApgQxugcggQVQHMBnAYUygAt0AeAFQD4AKAKGE5VqgGsAFVAgAO6VDACeALmAsEAIwBWMhgBpgwoaPESA0umnBSMVHAjFgAHyMSAtvIQAbAJTAAvE2AOnWCKo5cpOgwAGqYjmDoMnJKKuqaImKS+obGpuZWNvZO6gBu4ZEymBASrh7AuQhwACb+XMDEwWERUbIKysBqGlpJegYyaWYW1qR2Di7unsUS-q4A3gGcUEjGwPhEZJQ06O6yAPowmCTBRSXxPTopAyZDmaPZjurV6KRocMIwCKgygok6ACIvN4fL5lTwLer1ZYQVYgZBuYDPV6mEGoAB0+RaAG5FpC4CBZHD3G4EZBniAzOhqq4MDAwKgIDjcVCVjAUFRaCldgBlMZOFjcm7mFgJbTJAyuADUwAARHs9lAOegZc4cZCuEjgZ90ZjIrtwNB4EhZDBqHBSKdSsAIeq8QSWABCbZ8X5iiQsU3m9SK7YpZzzZm2+pBUIFdAes2kb1KlLqOFozDCYSOd2eqPAI7EMC2dAQGCkf1qoNcAC+gfVtPpyEaoZaEa97N9EqL6pLLchmpR2oxYbRPs5Bl2-fQKXbbbYuPWJAoSr7IgkzT1CJYSJglvUpAQ9KgrWmcYglrB1vLKFZwF4g4R8eHo5P+NkzoEF0kLE32-Q6gvpQDxcCTTDK4vDAn4GOoNaLuGb6oDuIHfu29Rlgh7aVgyayENOWy0DiZZsNCqxTpsSpDhg2B4OhhHbHQ0ysLiMSKOcfzila5Qis+fQSMAZjAO0zh1FwdEMW6sYVGGR4APJKOgsBouSlKur0AndIx7HqHMIktOoubZmImDyI4rQgOEQTACWvG0e0gm9H6kzcUoADaopWQYAC6bCqhOUCOJgpCkMABDHvUmC7AADO28ghUy9QAAIETO2y4jWBAsD+tppgmwCSgiACM8FcChyBpZgY4TtFsWYeguLeRI0ANMEABCyUBba+XAL8tjmugaIYJuji5OGzhoqauYsI15Q2r+LWSpKaXyLlnCmcVuKeUg-UyP542QnhbLhQiEDoAA7n5yVzV46UIoVJ3yGiO3ADNJ1lbOyzCAuAHyOoabqAQaIJJ8kiiGiiXuSeLWzbiZY4SwVXQKN4JLWeQW7QdR3uSyMI+GijgIMQLAypgAPBElzgqu2IBfLI+lsnAEWccAdDAAArFiGWSnAKXqnh6OY9jeOJclKO2njCOcYtqM9Z1XM4zz9XJcTuKk6g5PBDTCKhTTdOM8zrNNezKyc1jkP7ZgcBslLMANYWJ54zdcAi1wW1eLsePLXtx1w2j+kY-rMpXbzRP85w8uK5T1NU+rTNTVrG2i3r2M+wTfOXWdwtg27Yue9j3v42bMv+6AZMsBTyvAKrocM+HLNs5tusexLmCG8bp01ubuf1Fd1vFaZx1AA)
 */
export function createNoArgsCache<T>(
    checkProperty: (obj: T, propertyKey: string | symbol) => boolean,
    setValue: (obj: T, propertyKey: string | symbol, value: any) => void,
    getValue: (obj: T, propertyKey: string | symbol) => any,
    deleteValue: (obj: T, propertyKey: string | symbol) => any
) {
    const NoArgsCache = (_target: T, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const fn = descriptor.value;
        if (fn === undefined) return;

        const cacheKey = Symbol(String(propertyKey) + '__cache');
        descriptor.value = function (this: T) {
            if (!checkProperty(this, cacheKey)) {
                setValue(this, cacheKey, fn.apply(this, arguments));
            }
            return getValue(this, cacheKey);
        };
        descriptor.value.cacheKey = cacheKey;
    };

    NoArgsCache.copyValue = (dest: T, source: T, fn: any) => {
        const key = fn.cacheKey;
        if (checkProperty(source, key)) {
            setValue(dest, key, getValue(source, key));
        }
    };

    NoArgsCache.invalidate = (source: T, fn: any) => {
        const key = fn.cacheKey;
        deleteValue(source, key);
    };

    NoArgsCache.checkProperty = (obj: any, fn: any) => {
        const key = fn.cacheKey;
        return checkProperty(obj, key);
    };
    NoArgsCache.getValue = (obj: any, fn: any) => {
        const key = fn.cacheKey;
        return getValue(obj, key);
    };
    return NoArgsCache;
}

const CACHE_KEY = Symbol('CACHE_KEY');
export const NoArgsCache = createNoArgsCache<object>(
    (obj, propertyKey) => CACHE_KEY in obj && propertyKey in (obj[CACHE_KEY] as any),
    (obj, propertyKey, value) => {
        if (!(CACHE_KEY in obj)) {
            Object.defineProperty(obj, CACHE_KEY, { value: {}, enumerable: false });
        }
        (obj as any)[CACHE_KEY][propertyKey] = value;
    },
    (obj, propertyKey) => (obj as any)[CACHE_KEY][propertyKey],
    (obj, propertyKey) => {
        if (CACHE_KEY in obj) delete (obj as any)[CACHE_KEY][propertyKey];
    }
);

/* eslint-enable */
