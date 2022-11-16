export const CHAIN_ID_MAPPING = {
    ETHEREUM: 1,
    AVALANCHE: 43114,
    FUJI: 43113,
    MUMBAI: 80001,
} as const;

/**
 * Union of Pendle SDK's supported chain id type.
 * @see CHAIN_ID_MAPPING
 */
export type ChainId = typeof CHAIN_ID_MAPPING[keyof typeof CHAIN_ID_MAPPING];

export type MainchainId = typeof CHAIN_ID_MAPPING.ETHEREUM | typeof CHAIN_ID_MAPPING.FUJI;

/**
 * Check if a given chain id is a {@link MainchainId}
 * @param chainId the chain id to check
 * @returns true if chainId is {@link MainchainId}
 */
export function isMainchain(chainId: ChainId): chainId is MainchainId {
    return chainId === CHAIN_ID_MAPPING.ETHEREUM || chainId === CHAIN_ID_MAPPING.FUJI;
}
