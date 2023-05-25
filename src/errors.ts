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
import { Address } from 'common';

// The list of error code is here
// https://docs.ethers.io/v5/troubleshooting/errors/
// The following is done to convert an enum into union.
export type EthersJsErrorCode = ErrorCode[keyof ErrorCode];

/**
 * Pendle SDK Error base class to be extended by all errors.
 *
 * @remarks
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
/**
 * @deprecated It is not used anymore. To be remove.
 */
export class InvalidSlippageError extends PendleSdkError {
    constructor(invalidSlippage: number) {
        super(`Slippage must be a decimal value in the range [0, 1], but found ${invalidSlippage}`);
    }

    static verify(slippage: number) {
        if (slippage < 0 || slippage > 1) throw new InvalidSlippageError(slippage);
    }
}

export class NoRouteFoundError extends PendleSdkError {
    tokenInAddress: Address;
    tokenOutAddress: Address;
    actionName: string;

    constructor(actionName: string, from: Address, to: Address) {
        super(`No route found to ${actionName} from ${from} to ${to}`);
        this.tokenInAddress = from;
        this.tokenOutAddress = to;
        this.actionName = actionName;
    }

    static action(actionName: string, from: Address, to: Address) {
        return new NoRouteFoundError(actionName, from, to);
    }
}

/**
 * Custom error class for Ethers.js
 *
 * @remarks
 * Ethers.js doesn't have a custom error class, which errs the error to be thrown as Error,
 * that is hard to debug/show in the UI. So we create a custom error class to wrap the error
 * with readable error message.
 *
 * @See https://github.com/ethers-io/ethers.js/blob/01b5badbb616b29fd8b69ef7c3cc3833062da3d7/packages/logger/src.ts/index.ts#L197
 */
export class EthersJsError extends PendleSdkError {
    static USE_SIMPLE_MESSAGE = false;
    /**
     * List of error handlers to lookup.
     *
     * @remarks
     * This list can be overridden to have a custom behavior. We recommend to
     * only add new handler to this list.
     */
    static readonly MAKE_ERROR_CALLBACKS: Array<
        { (e: Error): Error | undefined } | { makeError(e: Error): Error | undefined }
    > = [];

    // Should be assigned in constructor with `Object.assign(this, err)`
    readonly code!: EthersJsErrorCode;

    // Should be assigned in constructor with `Object.assign(this, err)`
    readonly reason!: string;

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

    /**
     * @remarks
     * Should be overridden by subclasses
     */
    simpleMessage(): string {
        return this.reason;
    }

    static errorArgsInclude(err: Error, substring: string): boolean {
        const errorArgs = (err as any).errorArgs as string[];
        return Array.isArray(errorArgs) && errorArgs.length > 0 && errorArgs[0].includes(substring);
    }

    static isEthersJsError(err: Error): err is EthersJsError {
        return 'reason' in err && 'code' in err;
    }

    /**
     * Handle the error, using {@link EthersJsError.MAKE_ERROR_CALLBACKS}
     * @remarks
     * The handlers in {@link EthersJsError.MAKE_ERROR_CALLBACKS} are iterated,
     * used to process the err, and when an non-null (non-undefined) result
     * is returned, the process finish.
     *
     * If all handlers return undefined for the given `err`, This class ({@link EthersJsError})
     * is used to wrap the error.
     *
     * @param err the error to process.
     * @returns
     */
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

/**
 * Get the information of the Contract error and create the corresponding
 * Error object.
 *
 * @remarks
 * The Error thrown by ethersjs is very cryptic, as they do not have a custom
 * error type. To handle the error, they even need to [_dig in_ the error to find
 * the correct information](https://github.com/ethers-io/ethers.js/blob/44cbc7fa4e199c1d6113ceec3c5162f53def5bb8/packages/providers/src.ts/json-rpc-provider.ts#L25).
 * This class uses the same algorithm to get the information (such as the error selector
 * and byte code of the parameters). The information will then be passed to
 * the custom callback to determine and generate the desired Error object.
 *
 * @typeParam ErrorType - the type of the error to be generated.
 * @typeParam Fn - the callback type. It is used for both determine and transformation.
 *      Return `undefined` in this callback to signify that the information does not
 *      form the desired contract error type.
 */
export class ContractErrorFactory<
    ErrorType extends PendleSdkError,
    Fn extends (hexStringData: string, ethersJsError: Error) => ErrorType | undefined
> {
    /**
     *
     * @param createErrorObject - the callback.
     */
    constructor(readonly createErrorObject: Fn) {}

    /**
     * @remarks
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
            } catch {
                // Nothing
            }
        }
    }
}

/**
 * Error class that wrap all error from Pendle contract.
 *
 * @remarks
 * As there are a lot of errors that can be returned from the Pendle contract,
 * we only provide one class to wrap all the error. The error name can be
 * access via {@link PendleContractError#errorName}, and the arguments
 * can be access via {@link PendleContractError#args}.
 *
 * As we only use one class to wrap all the errors, initially {@link PendleContractError#args}
 * will not have a concrete type (you can think of `any[]`). To narrow down
 * which error, with the correct type of `args`, use {@link PendleContractError#isType}.
 *
 * @example
 * ```
 * try {
 *      // ....
 * } catch (e) {
 *     if (e instanceof PendleContractError) {
 *         if (e.isType('MarketInsufficientPtForTrade')) {
 *             // e.args will now have type [BN, BN]
 *         } else if (e.isType('ChainNotSupported')) {
 *             // e.args will now have type [BN]
 *         }
 *         // ...
 *     }
 * }
 * ```
 *
 * @typeParam ErrorType - the error type, defined by Pendle contracts. It is used
 *      to determine the correct type for {@link PendleContractError#args}.
 *
 * @see https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/core/libraries/Errors.sol for the list of errors
 * @see PendleContractErrorMessageHandler
 */
export class PendleContractError<
    ErrorType extends PendleContractErrorType = PendleContractErrorType
> extends PendleSdkError {
    static readonly errorsInterface = new Interface(PendleContractErrorsAbi);
    /**
     * The message handlers for the given error.
     *
     * @remarks
     * The handlers are used to generate a descriptive error message (to send to the `super`).
     * This can be overridden to have different error messages (for example, to have more user-friendly messages).
     */
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

    /**
     * @param errorName
     * @param args
     * @param ethersJsError - the error thrown by Ethers.js that causes this Error.
     */
    constructor(
        readonly errorName: ErrorType,
        readonly args: PendleContractErrorParams<ErrorType>,
        readonly ethersJsError: Error
    ) {
        const message: string = (PendleContractError.errorMessageHandler[errorName] as any)(...args);
        super(message);
    }

    /**
     * Determine the error type, by comparing {@link PendleContractError#errorName}.
     * @param otherType
     * @returns
     */
    isType<OtherErrorType extends PendleContractErrorType>(
        otherType: OtherErrorType
    ): this is PendleContractError<OtherErrorType> {
        // cast to string because tsc considered ErrorType and OtherErrorType 2 different type,
        // so the result _should_ be always false according to tsc.
        const currentErrorName: string = this.errorName;
        return currentErrorName === otherType;
    }
}

/**
 * This is used as super class of {@link ErrorBuiltinContractError} and {@link PanicBuiltinContractError}.
 */
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

/**
 * Wrapper class for `Panic` error thrown by a contract.
 */
export class PanicBuiltinContractError extends BuiltinContractError {
    constructor(readonly code: BN, readonly cause: Error) {
        super(`Panic error with code ${String(code)}`);
    }
}

/**
 * Wrapper class for `Error` error thrown by a contract.
 */
export class ErrorBuiltinContractError extends BuiltinContractError {
    constructor(readonly reason: string, readonly cause: Error) {
        super(reason);
    }
}

/**
 * Wrapper class for gas estimation error, when ethersjs' `estimateGas`
 * meta class is used.
 */
export class GasEstimationError extends PendleSdkError {
    constructor(readonly cause: Error) {
        super(`Gas estimation error: ${cause.message}`);
    }
}

/**
 * @deprecated {@link PendleContractError}`<'ApproxFail'>` is now used instead.
 */
export class ApproximateError extends EthersJsError {
    static makeError(err: Error): EthersJsError | undefined {
        if (!EthersJsError.errorArgsInclude(err, 'approx fail')) {
            return undefined;
        }
        return new ApproximateError(err);
    }
}

/**
 * @deprecated {@link PendleContractError} is now used instead.
 */
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

/**
 * @deprecated {@link PendleContractError} is now used instead.
 */
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

/**
 * @deprecated {@link PendleContractError} is now used instead.
 */
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
