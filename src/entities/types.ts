import type { providers, Signer } from 'ethers';
export type NetworkConnection = {
  provider: providers.Provider;
  signer?: Signer;
};

export type Address = string;
