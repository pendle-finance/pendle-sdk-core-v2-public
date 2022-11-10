import { ErrorCode } from '@ethersproject/logger';
import { Interface } from '@ethersproject/abi';
import { utils as ethersUtils, BigNumber as BN } from 'ethers';
import { abi as PendleContractErrorsAbi } from '@pendle/core-v2/build/artifacts/contracts/core/libraries/Errors.sol/Errors.json';
import {
    defaultPendleContractErrorMessageHandler,
    PendleContractErrorMessageHandler,
    PendleContractErrorType,
    PendleContractErrorParams,
} from './PendleContractErrorMessages';

// The list of error code is here
// https://docs.ethers.io/v5/troubleshooting/errors/
// The following is done to convert an enum into union.
export type EthersJsErrorCode = ErrorCode[keyof ErrorCode];

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
    static readonly MAKE_ERROR_CALLBACKS: Array<
        { (e: Error): Error | undefined } | { makeError(e: Error): Error | undefined }
    > = [];

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
            const result = 'makeError' in callback ? callback.makeError(err) : callback(err);
            if (result !== undefined) {
                return result;
            }
        }

        return new EthersJsError(err);
    }
}

export class ContractErrorFactory<
    ErrorType extends PendleSdkError,
    Fn extends (hexStringData: string, ethersJsError: Error) => ErrorType | undefined
> {
    constructor(readonly createErrorObject: Fn) {}

    /**
     * For the case of JsonRpcProvider, the error is highly nested.
     * Even in their source code they need to dig the data up.
     * This function only mimic that behavior.
     * https://github.com/ethers-io/ethers.js/blob/44cbc7fa4e199c1d6113ceec3c5162f53def5bb8/packages/providers/src.ts/json-rpc-provider.ts#L25
     */
    makeError(value: any, originalError: any = value): ErrorType | undefined {
        if (value == undefined) {
            return undefined;
        }

        // These *are* the droids we're looking for.

        // call revert exception is used because it is striped down in checkError (in ethers.js)
        if (typeof value.message === 'string' && value.message.match(/reverted|call revert exception/)) {
            const data = value.data;
            if (ethersUtils.isHexString(data)) {
                return this.createErrorObject(data, originalError);
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

export class PendleContractError<
    ErrorType extends PendleContractErrorType = PendleContractErrorType
> extends PendleSdkError {
    static readonly errorsInterface = new Interface(PendleContractErrorsAbi);
    static errorMessageHandler: PendleContractErrorMessageHandler = defaultPendleContractErrorMessageHandler;

    static factory = new ContractErrorFactory(PendleContractError.decodeEthersError.bind(PendleContractError));

    static decodeEthersError(data: string, ethersJsError: Error) {
        try {
            const errorDescription = this.errorsInterface.parseError(data);
            if (!errorDescription) {
                return undefined;
            }
            const name = errorDescription.name as PendleContractErrorType;
            const args = errorDescription.args as PendleContractErrorParams;
            return new PendleContractError(name, args, ethersJsError);
        } catch (_e) {
            return undefined;
        }
    }

    constructor(
        readonly errorName: ErrorType,
        readonly args: PendleContractErrorParams<ErrorType>,
        readonly ethersJsError: Error
    ) {
        const message: string = (PendleContractError.errorMessageHandler[errorName] as any).apply(null, args);
        super(message);
    }

    isType<OtherErrorType extends PendleContractErrorType>(
        otherType: OtherErrorType
    ): this is PendleContractError<OtherErrorType> {
        // cast to string because tsc considered ErrorType and OtherErrorType 2 different type,
        // so the result _should_ be always false according to tsc.
        const currentErrorName: string = this.errorName;
        return currentErrorName === otherType;
    }
}

export class BuiltinContractError extends PendleSdkError {
    // According to https://docs.soliditylang.org/en/v0.8.16/control-structures.html#error-handling-assert-require-revert-and-exceptions ,
    // the following two are the builtin errors.
    //
    // error Error(string)
    // error Panic(uint)

    static factory = new ContractErrorFactory(BuiltinContractError.decodeEthersError.bind(BuiltinContractError));

    static decodeEthersError(errorData: string, ethersJsError: Error) {
        errorData = errorData.toLowerCase();

        // https://ethereum.stackexchange.com/a/128807
        if (errorData.startsWith('0x08c379a0')) {
            // decode Error(string)

            const content = `0x${errorData.substring(10)}`;
            const [reason] = ethersUtils.defaultAbiCoder.decode(['string'], content);

            return new ErrorBuiltinContractError(reason, ethersJsError);
        }

        if (errorData.startsWith('0x4e487b71')) {
            // decode Panic(uint)
            const content = `0x${errorData.substring(10)}`;
            const [code] = ethersUtils.defaultAbiCoder.decode(['uint'], content);

            return new PanicBuiltinContractError(code, ethersJsError);
        }
        return undefined;
    }
}

export class PanicBuiltinContractError extends BuiltinContractError {
    constructor(readonly code: BN, readonly cause: Error) {
        super(`Panic error with code ${String(code)}`);
    }
}

export class ErrorBuiltinContractError extends BuiltinContractError {
    constructor(readonly reason: string, readonly cause: Error) {
        super(reason);
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
    PendleContractError.factory,
    BuiltinContractError.factory,
    ApproximateError,
    InsufficientFundError,
    MaxProportionExceededError,
    ExchangeRateBelowOneError
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
