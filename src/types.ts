import type { BigNumber as BN, BigNumberish, providers, Signer } from 'ethers';
import { ErrorCode } from '@ethersproject/logger';
import { CHAIN_ID } from './constants';

// Disallow missing both of the properties
export type NetworkConnection =
    | { provider: providers.Provider; signer?: undefined }
    | { provider?: undefined; signer: Signer }
    | { provider: providers.Provider; signer: Signer };

export type Address = string;

export type TokenAmount<AmountType extends BigNumberish = BN> = {
    token: Address;
    amount: AmountType;
};

// The list of error code is here
// https://docs.ethers.io/v5/troubleshooting/errors/
// The following is done to convert an enum into union.
export type EthersJsErrorCode = ErrorCode[keyof ErrorCode];

export { ChainId } from './constants';
export type MainchainId = typeof CHAIN_ID.ETHEREUM | typeof CHAIN_ID.FUJI;
