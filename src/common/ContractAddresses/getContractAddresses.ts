import { PendleSdkError } from '../../errors';
import { ContractAddresses } from './types';
import { ARBITRUM_CORE_ADDRESSES, ETHEREUM_CORE_ADDRESSES, FUJI_CORE_ADDRESSES, MUMBAI_CORE_ADDRESSES } from './data';
import { ChainId, CHAIN_ID_MAPPING } from '../ChainId';

export const CONTRACT_ADDRESSES: Partial<Record<ChainId, ContractAddresses>> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: ETHEREUM_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.FUJI]: FUJI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.MUMBAI]: MUMBAI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.ARBITRUM]: ARBITRUM_CORE_ADDRESSES,
};

export function getContractAddresses(chainId: ChainId): ContractAddresses {
    const res = CONTRACT_ADDRESSES[chainId];
    if (res == undefined) {
        throw new PendleSdkError(`There is no default contract addresses for chain ${chainId}`);
    }
    return res;
}
