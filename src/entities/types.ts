import type { BigNumber as BN, providers, Signer } from 'ethers';
export type NetworkConnection = {
  provider: providers.Provider;
  signer?: Signer;
};

// To-do
export type Token = {};

export type TokenAmount = {
  token: Token;
  amount: BN;
};

export type Address = string;
