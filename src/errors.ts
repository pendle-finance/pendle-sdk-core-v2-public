import { EtherErrorCode } from 'types';
import { ErrorCode } from '@ethersproject/logger';
import { Logger } from '@ethersproject/logger';

/**
 * Hack:
 * As in https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
 * the method Logger#makeError will first set reason and code to the error, and then copy the params into the error.
 * But in https://github.com/ethers-io/ethers.js/blob/ec1b9583039a14a0e0fa15d0a2a6082a2f41cf5b/packages/abi/src.ts/interface.ts#L383
 * there is possibility of reason (of the params) being null, and it will overwrite the reason of the error.
 *
 * This hack will try to prevent that kind of overwrite.
 */
const oldMakeError = Logger.prototype.makeError;

Logger.prototype.makeError = function (message: string, code?: ErrorCode, params?: any): Error {
    if (typeof params === 'object' && params.reason == undefined) {
        params.reason = message;
    }
    return oldMakeError.call(this, message, code, params);
};

/**
 * A general decorator for catching error from async functions
 *
 * Don't need syncCatchError since most of the time we are using async functions
 */
export function asyncCatchError(handler: (error: any) => Promise<any>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const fn = descriptor.value;
        descriptor.value = async function (...args: any) {
            return Promise.resolve(fn.apply(this, args)).catch(handler);
        };
    };
}

export class InvalidSlippageError extends Error {
    constructor() {
        super('Slippage must be a decimal value in the range [0, 1]');
    }

    static verify(slippage: number) {
        if (slippage < 0 || slippage > 1) throw new InvalidSlippageError();
    }
}

export class NoRouteFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoRouteFoundError';
    }

    static action(actionName: string, from: string, to: string) {
        return new NoRouteFoundError(`No route found to ${actionName} from ${from} to ${to}`);
    }
}

// See https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
export class EtherError extends Error {
    readonly code: EtherErrorCode;
    readonly reason: string;

    // must assume that cause is the error thrown by ether's logger, because it does not has a type.
    constructor(cause: Error) {
        const reason = (cause as any).reason;
        const code = (cause as any).code;
        super(`Error from ethers: ${reason}. code = ${code}`, { cause });
        this.reason = reason;
        this.code = code;

        this.name = 'EtherError';
    }

    static isEtherError(error: Error): boolean {
        return 'code' in error && 'reason' in error;
    }

    static rethrow: (cause: Error) => never;
}

export class ApproximateError extends EtherError {
    constructor(cause: Error) {
        super(cause);
        this.name = 'ApproximateError';
    }

    static isApproximateError(cause: Error): boolean {
        return (cause as any).reason === 'approx fail';
    }
}

export class InsufficientFundError extends EtherError {
    constructor(cause: Error) {
        super(cause);
        this.name = 'InsufficientFundError';
    }

    static isInsufficientFundError(cause: Error) {
        return ((cause as any).reason as string).toLowerCase().includes('insufficient');
    }
}

EtherError.rethrow = function (cause: Error) {
    if (InsufficientFundError.isInsufficientFundError(cause)) {
        throw new InsufficientFundError(cause);
    }

    if (ApproximateError.isApproximateError(cause)) {
        throw new ApproximateError(cause);
    }

    // For later adding error, just another if statement here

    if (EtherError.isEtherError(cause)) {
        throw new EtherError(cause);
    }

    throw cause;
};

/**
 * Decorator for catching error from ethers.js
 */
export function catchEtherError(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    return asyncCatchError(EtherError.rethrow)(target, propertyKey, descriptor);
}
