import { PendleSdkError } from '../../errors';
import { ContractAddresses } from './types';
import * as data from './data';
import { ChainId, CHAIN_ID_MAPPING } from '../ChainId';

export const CONTRACT_ADDRESSES: Record<ChainId, ContractAddresses> = {
    [CHAIN_ID_MAPPING.ETHEREUM]: data.ETHEREUM_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.FUJI]: data.FUJI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.MUMBAI]: data.MUMBAI_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.ARBITRUM]: data.ARBITRUM_CORE_ADDRESSES,
    [CHAIN_ID_MAPPING.BSC]: data.BSC_CORE_ADDRESSES,
};

export function getContractAddresses(chainId: ChainId): ContractAddresses {
    const res = CONTRACT_ADDRESSES[chainId];
    if (res == undefined) {
        throw new PendleSdkError(`There is no default contract addresses for chain ${chainId}`);
    }
    return res;
}
