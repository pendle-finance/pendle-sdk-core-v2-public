import { EthersJsErrorCode } from './types';

/**
 * Pendle SDK Error base class to be extended by all errors.
 *
 * We use this class for later error handling and wrapping.
 *
 * By wrapping all the errors throw by Ethers.js with this class, we can show
 * user-friendly error messages to users.
 */
export class PendleSdkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;

        // Set the prototype explicitly.
        // See: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
        Object.setPrototypeOf(this, this.constructor.prototype);
    }
}

export class InvalidSlippageError extends PendleSdkError {
    constructor(invalidSlippage: number) {
        super(`Slippage must be a decimal value in the range [0, 1], but found ${invalidSlippage}`);
    }

    static verify(slippage: number) {
        if (slippage < 0 || slippage > 1) throw new InvalidSlippageError(slippage);
    }
}

export class NoRouteFoundError extends PendleSdkError {
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
export class EthersJsError extends PendleSdkError {
    static USE_SIMPLE_MESSAGE: boolean = false;
    // @ts-ignore
    readonly code: EthersJsErrorCode;
    // @ts-ignore
    readonly reason: string;

    readonly originalMessage: string;

    // must assume that err is the error thrown by ether's logger, because it does not has a type.
    constructor(err: Error) {
        super(err.message);

        Object.assign(this, err);
        this.originalMessage = this.message;

        // Instead of using console.log(err.simpleMessage), we override the default
        // message with the simple message, So that console.log(err) will show the simple message.

        // This behavior is controlled by the static property USE_SIMPLE_MESSAGE, which is set to false
        // by default to keep the original message in case of debugging.
        if (EthersJsError.USE_SIMPLE_MESSAGE) {
            this.message = this.simpleMessage();
        }

        // Override again because the Object.assign above
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, EthersJsError.prototype);
    }

    simpleMessage(): string {
        // Should be overridden by subclasses
        return this.reason;
    }

    static errorArgsInclude(err: Error, substring: string): boolean {
        const errorArgs = (err as any).errorArgs as string[];
        return Array.isArray(errorArgs) && errorArgs.length > 0 && errorArgs[0].includes(substring);
    }

    static isEtherJsError(err: Error): boolean {
        return 'reason' in err && 'code' in err;
    }

    /**
     *  If you want to check more types of errors, add a callback to this array.
     */
    static readonly MAKE_ERROR_CALLBACKS: ((e: Error) => EthersJsError | undefined)[] = [];
    static makeEtherJsError: (err: Error) => EthersJsError | Error;
}

export class ApproximateError extends EthersJsError {
    static isApproximateError(err: Error): boolean {
        return EthersJsError.errorArgsInclude(err, 'approx fail');
    }
}

export class InsufficientFundError extends EthersJsError {
    static isInsufficientFundError(err: Error) {
        return (
            EthersJsError.errorArgsInclude(err, 'insufficient') &&
            !EthersJsError.errorArgsInclude(err, 'insufficient allowance')
        );
    }
}

export class InsufficientPtError extends EthersJsError {
    static isInsufficientPtError(err: Error) {
        return EthersJsError.errorArgsInclude(err, 'max proportion exceeded');
    }

    simpleMessage(): string {
        return 'Insufficient PT to perform this action';
    }
}

EthersJsError.makeEtherJsError = function (err: Error) {
    if (!EthersJsError.isEtherJsError(err)) {
        return err;
    }

    if (InsufficientFundError.isInsufficientFundError(err)) {
        return new InsufficientFundError(err);
    }

    if (ApproximateError.isApproximateError(err)) {
        return new ApproximateError(err);
    }

    if (InsufficientPtError.isInsufficientPtError(err)) {
        return new InsufficientPtError(err);
    }

    for (const callback of EthersJsError.MAKE_ERROR_CALLBACKS) {
        const result = callback(err);
        if (result !== undefined) {
            return result;
        }
    }

    return new EthersJsError(err);
};

/**
 * Somehow we cannot override Logger.prototype.makeError, so skipped this part for now
 */

/**
 * Wrap Error thrown by ethers.js with EtherError.
 *
 * This method will try to identify the error and wrap it with the appropriate error class.
 */
// const oldMakeError = Logger.prototype.makeError;

// Logger.prototype.makeError = function (message: string, code?: ErrorCode, params?: any): Error {
//     if (typeof params === 'object' && params.reason == undefined) {
//         /**
//          *
//          * As in https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
//          * the method Logger#makeError will first set reason and code to the error, and then copy the params into the error.
//          * But in https://github.com/ethers-io/ethers.js/blob/ec1b9583039a14a0e0fa15d0a2a6082a2f41cf5b/packages/abi/src.ts/interface.ts#L383
//          * there is possibility of reason (of the params) being null, and it will overwrite the reason of the error.
//          *
//          * This hack will try to prevent that kind of overwrite.
//          */
//         params.reason = message;
//     }

//     let err = oldMakeError.call(this, message, code, params);

//     return EthersJsError.makeEtherJsError(err);
// };
