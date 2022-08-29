import type { BigNumber as BN, providers, Signer } from 'ethers';
import { ErrorCode } from '@ethersproject/logger';

export type NetworkConnection = {
    provider: providers.Provider;
    signer?: Signer;
};

export type Address = string;

export type TokenAmount = {
    token: Address;
    amount: BN;
};

// The list of error code is here
// https://docs.ethers.io/v5/troubleshooting/errors/
// The following is done to convert an enum into union.
export type EthersJsErrorCode = ErrorCode[keyof ErrorCode];
