import { PendleSdkError, EthersJsError } from '../errors';

export class MulticallError extends PendleSdkError {
    readonly decodedError: Error;
    constructor(
        cause: Error,
        readonly callData: string
    ) {
        const decodedError = EthersJsError.handleEthersJsError(cause);
        super(`MulticallError: ${decodedError.message}`, { cause });
        this.decodedError = decodedError;
    }
}
