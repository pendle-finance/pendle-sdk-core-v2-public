import type { providers, Signer } from 'ethers';
export type NetworkConnection = {
    provider: providers.Provider;
    signer?: Signer;
};

// To-do
export type TokenAmount = {};
export type Address = string;
