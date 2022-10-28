import { PendleContractErrorMessageHandler } from './type';

export type PendleContractErrorType = keyof PendleContractErrorMessageHandler;
export type PendleContractErrorParams<ErrorType extends PendleContractErrorType = PendleContractErrorType> = Parameters<
    PendleContractErrorMessageHandler[ErrorType]
>;
