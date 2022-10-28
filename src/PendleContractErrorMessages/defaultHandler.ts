import { PendleContractErrorMessageHandler } from './type';
import { PendleContractErrorType, PendleContractErrorParams } from './helperTypes';

export function createPendlecontractErrorMessageHandler(
    defaultHandler: Partial<PendleContractErrorMessageHandler>,
    fallback: <Key extends PendleContractErrorType>(errorName: Key, ...args: PendleContractErrorParams<Key>) => string
) {
    return new Proxy(defaultHandler, {
        get(target, key: PendleContractErrorType) {
            if (key in target) {
                return target[key];
            }
            return (...args: any[]) => fallback(key, ...(args as PendleContractErrorParams));
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
