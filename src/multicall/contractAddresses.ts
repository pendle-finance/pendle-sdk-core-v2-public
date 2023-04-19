import { Address, toAddress, ChainId, CHAIN_ID_MAPPING } from '../common';

export const MULTICALL_ADDRESSES_NO_GAS_LIMIT: Record<ChainId, Address> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: toAddress('0x5ba1e12693dc8f9c48aad8770482f4739beed696'),
    [CHAIN_ID_MAPPING.FUJI]: toAddress('0x07e46d95cc98f0d7493d679e89e396ea99020185'),
    [CHAIN_ID_MAPPING.MUMBAI]: toAddress('0x7De28d05a0781122565F3b49aA60331ced983a19'),
    [CHAIN_ID_MAPPING.ARBITRUM]: toAddress('0xcA11bde05977b3631167028862bE2a173976CA11'),
} as const;

export const PendleMulticallV1Address = toAddress('0xfd6Df9EFACfEfdF4E610d687A9c9b941D1b1Bf75');

export const MULTICALL_ADDRESSES_WITH_GAS_LIMIT: Record<ChainId, Address> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: PendleMulticallV1Address,
    [CHAIN_ID_MAPPING.FUJI]: PendleMulticallV1Address,
    [CHAIN_ID_MAPPING.MUMBAI]: PendleMulticallV1Address,
    [CHAIN_ID_MAPPING.ARBITRUM]: PendleMulticallV1Address,
};
