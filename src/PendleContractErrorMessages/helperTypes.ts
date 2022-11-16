import { PendleContractErrorMessageHandler } from './type';

/**
 * Union of contract error names.
 */
export type PendleContractErrorType = keyof PendleContractErrorMessageHandler;

/**
 * Get the parameters type for a given `ErrorType`.
 */
export type PendleContractErrorParams<ErrorType extends PendleContractErrorType = PendleContractErrorType> = Parameters<
    PendleContractErrorMessageHandler[ErrorType]
>;
