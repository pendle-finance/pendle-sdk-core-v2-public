import { CHAIN_ID_MAPPING, ChainId } from '../../src';

export const LOCAL_CHAIN_ID = 31337;

export type SupportedChainId = typeof LOCAL_CHAIN_ID | ChainId;

export const MAPPING = {
    [CHAIN_ID_MAPPING.ETHEREUM]: 'https://eth.llamarpc.com',
    [CHAIN_ID_MAPPING.ARBITRUM]: 'https://arbitrum.llamarpc.com',
    [CHAIN_ID_MAPPING.BSC]: 'https://binance.llamarpc.com',
    [CHAIN_ID_MAPPING.OPTIMISM]: 'https://optimism.llamarpc.com',

    [CHAIN_ID_MAPPING.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
} as const satisfies Record<SupportedChainId, string>;

/**
 * @privateRemarks
 * Encapsulate the logic here so additional logic can be added.
 * E.g. return Infura URL if INFURA_PROJECT_ID is provided in the environment.
 */
export function lookup(chainId: SupportedChainId): string {
    return MAPPING[chainId];
}
