import { EtherErrorCode } from './types';
import { ErrorCode } from '@ethersproject/logger';
import { Logger } from '@ethersproject/logger';

export class CustomError extends Error {
    getReadableMessage(): string {
        return this.message;
    }
}

export class InvalidSlippageError extends CustomError {
    constructor() {
        super('Slippage must be a decimal value in the range [0, 1]');

        // Set the prototype explicitly.
        // See: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
        Object.setPrototypeOf(this, InvalidSlippageError.prototype);
    }

    static verify(slippage: number) {
        if (slippage < 0 || slippage > 1) throw new InvalidSlippageError();
    }
}

export class NoRouteFoundError extends CustomError {
    constructor(message: string) {
        super(message);
        this.name = 'NoRouteFoundError';
        Object.setPrototypeOf(this, NoRouteFoundError.prototype);
    }

    static action(actionName: string, from: string, to: string) {
        return new NoRouteFoundError(`No route found to ${actionName} from ${from} to ${to}`);
    }
}

/**
 * Custom error class for Ethers.js
 *
 * Ethers.js doesn't have a custom error class, which errs the error to be thrown as Error,
 * that is hard to debug/show in the UI. So we create a custom error class to wrap the error
 * with readable error message.
 *
 * See https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
 */
export class EtherError extends CustomError {
    readonly code: EtherErrorCode = ErrorCode.UNKNOWN_ERROR;
    readonly reason: string = '';

    // must assume that err is the error thrown by ether's logger, because it does not has a type.
    constructor(err: Error) {
        super(err.message);
        // copy over the properties from the err error
        Object.assign(this, err);

        this.name = 'EtherError';
        Object.setPrototypeOf(this, EtherError.prototype);
    }

    public getReadableMessage(): string {
        return `${this.name}: ${this.reason}`;
    }

    static errorArgsInclude(err: Error, substring: string): boolean {
        const errorArgs = (err as any).errorArgs as string[];
        return Array.isArray(errorArgs) && errorArgs.length > 0 && errorArgs[0].includes(substring);
    }
}

export class ApproximateError extends EtherError {
    constructor(err: Error) {
        super(err);
        this.name = 'ApproximateError';
        Object.setPrototypeOf(this, ApproximateError.prototype);
    }

    static isApproximateError(err: Error): boolean {
        return EtherError.errorArgsInclude(err, 'approx fail');
    }
}

export class InsufficientFundError extends EtherError {
    constructor(err: Error) {
        super(err);
        this.name = 'InsufficientFundError';
        Object.setPrototypeOf(this, InsufficientFundError.prototype);
    }

    static isInsufficientFundError(err: Error) {
        return EtherError.errorArgsInclude(err, 'insufficient');
    }
}

/**
 * Wrap Error thrown by ethers.js with EtherError.
 *
 * This method will try to identify the error and wrap it with the appropriate error class.
 */
const oldMakeError = Logger.prototype.makeError;

/**
 *  If you want to check more types of errors, add the callback to this array.
 */
export const MAKE_ERROR_CALLBACKS: ((e: Error) => EtherError | undefined)[] = [];

Logger.prototype.makeError = function (message: string, code?: ErrorCode, params?: any): Error {
    if (typeof params === 'object' && params.reason == undefined) {
        /**
         *
         * As in https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
         * the method Logger#makeError will first set reason and code to the error, and then copy the params into the error.
         * But in https://github.com/ethers-io/ethers.js/blob/ec1b9583039a14a0e0fa15d0a2a6082a2f41cf5b/packages/abi/src.ts/interface.ts#L383
         * there is possibility of reason (of the params) being null, and it will overwrite the reason of the error.
         *
         * This hack will try to prevent that kind of overwrite.
         */
        params.reason = message;
    }

    let err = oldMakeError.call(this, message, code, params);

    if (InsufficientFundError.isInsufficientFundError(err)) {
        return new InsufficientFundError(err);
    }

    if (ApproximateError.isApproximateError(err)) {
        return new ApproximateError(err);
    }

    for (const callback of MAKE_ERROR_CALLBACKS) {
        const result = callback(err);
        if (result !== undefined) {
            return result;
        }
    }

    return new EtherError(err);
};
