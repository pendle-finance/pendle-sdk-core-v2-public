import { providers, Signer } from 'ethers';

/**
 * Container type for ethersjs' Provider and/or Signer.
 *
 * @remarks
 * This type disallow missing both of the properties.
 */
export type NetworkConnection =
    | { provider: providers.Provider; signer?: undefined }
    | { provider?: undefined; signer: Signer }
    | { provider: providers.Provider; signer: Signer };

/**
 * Copy provider and signer field of a ~NetworkConnection`.
 */
export function copyNetworkConnection(networkConnection: NetworkConnection): NetworkConnection {
    if (networkConnection.provider === undefined) {
        return { signer: networkConnection.signer };
    }
    return { provider: networkConnection.provider, signer: networkConnection.signer };
}
