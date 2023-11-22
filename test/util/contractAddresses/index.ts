import { MAINNET_CONTRACT_ADDRESSES } from './mainnet';
import { FUJI_TESTNET_CONTRACT_ADDRESSES } from './testnet';
import { MUMBAI_TESTNET_CONTRACT_ADDRESSES } from './mumbai';
import { ARBITRUM_CONTRACT_ADDRESSES } from './arbitrum';
import { BSC_CONTRACT_ADDRESSES } from './bsc';
import { MANTLE_CONTRACT_ADDRESSES } from './mantle';
import { OPTIMISM_CONTRACT_ADDRESSES } from './optimism';

import { CHAIN_ID_MAPPING, ChainId } from '../../../src';

export const CONTRACT_ADDRESSES = {
    [CHAIN_ID_MAPPING.FUJI]: FUJI_TESTNET_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.ETHEREUM]: MAINNET_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.MUMBAI]: MUMBAI_TESTNET_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.ARBITRUM]: ARBITRUM_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.BSC]: BSC_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.MANTLE]: MANTLE_CONTRACT_ADDRESSES,
    [CHAIN_ID_MAPPING.OPTIMISM]: OPTIMISM_CONTRACT_ADDRESSES,
} as const satisfies Record<ChainId, object>;

// choose the markets you want to test here
export const MARKET_TO_TEST = {
    [CHAIN_ID_MAPPING.FUJI]: CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.FUJI].MARKETS_BY_NAME.APE_MARCH30_ADDRESSES,
    [CHAIN_ID_MAPPING.ETHEREUM]: CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.ETHEREUM].MARKETS_BY_NAME.MAINNET_SDAI_26SEP2024,
    [CHAIN_ID_MAPPING.MUMBAI]:
        CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.MUMBAI].MARKETS_BY_NAME.MUMBAI_QIUSDC_DEC08_ADDRESSES,
    [CHAIN_ID_MAPPING.ARBITRUM]:
        CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.ARBITRUM].MARKETS_BY_NAME.ARBITRUM_GDAI_MAR28_2024_ADDRESSES,
    [CHAIN_ID_MAPPING.BSC]: CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.BSC].MARKETS_BY_NAME.THENA_FRXETH_ETH_JUNE2024,
    [CHAIN_ID_MAPPING.MANTLE]: CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.MANTLE].MARKETS_BY_NAME.WSTETH_MANTLE_MARCH2024,
    [CHAIN_ID_MAPPING.OPTIMISM]: CONTRACT_ADDRESSES[CHAIN_ID_MAPPING.OPTIMISM].MARKETS_BY_NAME.RETH_OPTIMISM_JUNE2024,
} as const satisfies Record<ChainId, object>;
