import type { BigNumber as BN, providers, Signer } from 'ethers';
export type NetworkConnection = {
    provider: providers.Provider;
    signer?: Signer;
};

export type Address = string;

export type TokenAmount = {
    token: Address;
    amount: BN;
};
