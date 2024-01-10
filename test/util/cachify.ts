import {} from 'type-fest';
export function cachify<Fn extends (...params: any[]) => unknown>(
    keyGen: (thisObj: ThisType<Fn>, ...params: Parameters<Fn>) => string[],
    fn: Fn
): Fn {
    const cache = new Map<string, unknown>();
    return function (this: unknown, ...params: Parameters<Fn>) {
        const key = JSON.stringify(keyGen(this as ThisType<Fn>, ...params));
        if (cache.has(key)) return cache.get(key);
        const val = fn.apply(this, params);
        cache.set(key, val);
        return val;
    } as Fn;
}

type Builtin = string | number | boolean | bigint;
type IsBuiltin<T> = T extends Builtin ? true : false;
type AreBuiltins<Arr> = Arr extends readonly []
    ? true
    : Arr extends readonly (infer T)[]
      ? IsBuiltin<T>
      : Arr extends readonly [head: infer Head, ...tails: infer Tail]
        ? [IsBuiltin<Head>, AreBuiltins<Tail>] extends [true, true]
            ? true
            : false
        : false;
type IsFunctionOfBuiltin<T> = T extends (...params: infer Params) => unknown
    ? AreBuiltins<Params> extends true
        ? T
        : never
    : never;

export function cachifyBuiltinOnly<Fn>(fn: IsFunctionOfBuiltin<Fn>): Fn {
    return cachify((_thisObj, ...params) => params.map((val) => String(val)), fn);
}
