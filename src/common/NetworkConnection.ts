import { providers, Signer } from 'ethers';

// Disallow missing both of the properties
export type NetworkConnection =
    | { provider: providers.Provider; signer?: undefined }
    | { provider?: undefined; signer: Signer }
    | { provider: providers.Provider; signer: Signer };

/**
 * This function only copy provider and signer field of a NetworkConnection.
 * So { ...networkConnection } is not valid in this case.
 * NetworkConnection is an union type, so to copying it is not simply as doing
 *      { provider: networkConnection.provider, signer: networkConnection.signer }
 */
export function copyNetworkConnection(networkConnection: NetworkConnection): NetworkConnection {
    if (networkConnection.provider === undefined) {
        return { signer: networkConnection.signer };
    }
    return { provider: networkConnection.provider, signer: networkConnection.signer };
}
