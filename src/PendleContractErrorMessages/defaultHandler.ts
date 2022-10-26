import { PendleContractErrorMessageHandler } from './type';

export function createPendlecontractErrorMessageHandler(
    defaultHandler: Partial<PendleContractErrorMessageHandler>,
    fallback: <Key extends keyof PendleContractErrorMessageHandler>(
        errorName: Key,
        ...args: Parameters<PendleContractErrorMessageHandler[Key]>
    ) => string
) {
    return new Proxy(defaultHandler, {
        get(target, key: keyof PendleContractErrorMessageHandler) {
            if (key in target) {
                return target[key];
            }
            return (...args: any[]) =>
                fallback(key, ...(args as Parameters<PendleContractErrorMessageHandler[typeof key]>));
        },
    }) as PendleContractErrorMessageHandler;
}

function joinArgs(args: any[]) {
    return args.map((arg) => String(arg)).join(', ');
}

// TODO write more descriptive error messages.
export const defaultPendleContractErrorMessageHandler: PendleContractErrorMessageHandler =
    createPendlecontractErrorMessageHandler(
        {},
        (errorName, ...args) => `Pendle contract error: ${errorName}(${joinArgs(args)})`
    );
