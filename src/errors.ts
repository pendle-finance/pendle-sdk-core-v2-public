import { EthersJsErrorCode } from './types';
import { Interface } from '@ethersproject/abi';
import { BytesLike, utils as ethersUtils } from 'ethers';
import { abi as PendleContractErrorsAbi } from '@pendle/core-v2/build/artifacts/contracts/core/libraries/Errors.sol/Errors.json';
import {
    defaultPendleContractErrorMessageHandler,
    PendleContractErrorMessageHandler,
} from './PendleContractErrorMessages';

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
    /**
     *  If you want to check more types of errors, add a callback to this array.
     */
    static readonly MAKE_ERROR_CALLBACKS: ((e: Error) => Error | undefined)[] = [];

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

        Object.setPrototypeOf(this, this.constructor.prototype);
    }

    simpleMessage(): string {
        // Should be overridden by subclasses
        return this.reason;
    }

    static errorArgsInclude(err: Error, substring: string): boolean {
        const errorArgs = (err as any).errorArgs as string[];
        return Array.isArray(errorArgs) && errorArgs.length > 0 && errorArgs[0].includes(substring);
    }

    static isEthersJsError(err: Error): boolean {
        return 'reason' in err && 'code' in err;
    }

    static handleEthersJsError(err: Error): Error {
        if (!EthersJsError.isEthersJsError(err)) {
            return err;
        }

        for (const callback of EthersJsError.MAKE_ERROR_CALLBACKS) {
            const result = callback(err);
            if (result !== undefined) {
                return result;
            }
        }

        return new EthersJsError(err);
    }
}

export class PendleContractError extends PendleSdkError {
    static readonly errorsInterface = new Interface(PendleContractErrorsAbi);
    static errorMessageHandler: PendleContractErrorMessageHandler = defaultPendleContractErrorMessageHandler;

    constructor(
        readonly errorName: keyof PendleContractErrorMessageHandler,
        readonly args: any[],
        readonly ethersJsError: Error
    ) {
        const message: string = (PendleContractError.errorMessageHandler[errorName] as any).apply(null, args);
        super(message);
    }

    static decodeEthersError(data: BytesLike, ethersJsError: Error) {
        try {
            const errorDescription = this.errorsInterface.parseError(data);
            if (!errorDescription) {
                return undefined;
            }
            const name = errorDescription.name as keyof typeof defaultPendleContractErrorMessageHandler;
            const args = errorDescription.args as any[];
            return new PendleContractError(name, args, ethersJsError);
        } catch (_e) {
            return undefined;
        }
    }

    /**
     * For the case of JsonRpcProvider, the error is highly nested.
     * Even in their source code they need to dig the data up.
     * This function only mimic that behavior.
     * https://github.com/ethers-io/ethers.js/blob/44cbc7fa4e199c1d6113ceec3c5162f53def5bb8/packages/providers/src.ts/json-rpc-provider.ts#L25
     */
    static makeError(value: any, originalError: any = value): PendleContractError | undefined {
        if (value == undefined) {
            return undefined;
        }

        // These *are* the droids we're looking for.

        // call revert exception is used because it is striped down in checkError (in ethers.js)
        if (typeof value.message === 'string' && value.message.match(/reverted|call revert exception/)) {
            const data = value.data;
            if (ethersUtils.isHexString(data)) {
                return this.decodeEthersError(data, originalError);
            }
        }

        // Spelunk further...
        if (typeof value === 'object') {
            for (const field of Object.values(value)) {
                const result = this.makeError(field, originalError);
                if (result) {
                    return result;
                }
            }
            return undefined;
        }

        // Might be a JSON string we can further descend...
        if (typeof value === 'string') {
            try {
                return this.makeError(JSON.parse(value), originalError);
            } catch (error) {}
        }
    }
}

export class GasEstimationError extends PendleSdkError {
    constructor(readonly cause: Error) {
        super(`Gas estimation error: ${cause.message}`);
    }
}

export class ApproximateError extends EthersJsError {
    static makeError(err: Error): EthersJsError | undefined {
        if (!EthersJsError.errorArgsInclude(err, 'approx fail')) {
            return undefined;
        }
        return new ApproximateError(err);
    }
}

export class InsufficientFundError extends EthersJsError {
    static makeError(err: Error): EthersJsError | undefined {
        if (
            !EthersJsError.errorArgsInclude(err, 'insufficient') ||
            EthersJsError.errorArgsInclude(err, 'insufficient allowance')
        ) {
            return undefined;
        }
        return new InsufficientFundError(err);
    }
}

export class MaxProportionExceededError extends EthersJsError {
    static makeError(err: Error) {
        if (!EthersJsError.errorArgsInclude(err, 'max proportion exceeded')) {
            return undefined;
        }
        return new MaxProportionExceededError(err);
    }

    simpleMessage(): string {
        return 'Insufficient SY in the liquidity pool to execute the action';
    }
}

export class ExchangeRateBelowOneError extends EthersJsError {
    static makeError(err: Error) {
        if (!EthersJsError.errorArgsInclude(err, 'exchange rate below 1')) {
            return undefined;
        }
        return new ExchangeRateBelowOneError(err);
    }

    simpleMessage(): string {
        return 'Insufficient PT in the liquidity pool to execute the action';
    }
}

EthersJsError.MAKE_ERROR_CALLBACKS.push(
    PendleContractError.makeError.bind(PendleContractError),
    ApproximateError.makeError,
    InsufficientFundError.makeError,
    MaxProportionExceededError.makeError,
    ExchangeRateBelowOneError.makeError
);

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
