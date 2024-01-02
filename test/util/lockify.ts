// https://blog.testdouble.com/posts/2019-05-14-locking-with-promises/
export const lockify = <Fn extends (...params: any[]) => Promise<any>>(f: Fn): Fn => {
    let lock = Promise.resolve();
    const res = (...params: any[]) => {
        const result = lock.then(() => f(...params));
        lock = result.catch(() => {}) as Promise<void>;
        return result;
    };
    return res as Fn;
};
