import ETHEREUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-core.json';
import ARBITRUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/42161-core.json';
import BSC_CORE_ADDRESSES from '@pendle/core-v2/deployments/56-core.json';
import MANTLE_CORE_ADDRESSES from '@pendle/core-v2/deployments/5000-core.json';
import OPTIMISM_CORE_ADDRESSES from '@pendle/core-v2/deployments/10-core.json';

import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-core.json';

import ETHEREUM_OFFCHAIN_HELPER from '@pendle/core-v2-mainnet/deployments/1-offchain-helper.json';
import ARBITRUM_OFFCHAIN_HELPER from '@pendle/core-v2-mainnet/deployments/42161-offchain-helper.json';
import BSC_OFFCHAIN_HELPER from '@pendle/core-v2-mainnet/deployments/56-offchain-helper.json';
import OPTIMISM_OFFCHAIN_HELPER from '@pendle/core-v2-mainnet/deployments/10-offchain-helper.json';

import { toAddress, toAddressOrUndefined } from '../src/common/Address';
import { ContractAddresses } from '../src/common/ContractAddresses/types';
import { writeTsThenFormat } from './writeTsThenFormat';

type CoreAddresses =
    | typeof ETHEREUM_CORE_ADDRESSES
    | typeof ARBITRUM_CORE_ADDRESSES
    | typeof FUJI_CORE_ADDRESSES
    | typeof MUMBAI_CORE_ADDRESSES
    | typeof BSC_CORE_ADDRESSES
    | typeof MANTLE_CORE_ADDRESSES
    | typeof OPTIMISM_CORE_ADDRESSES;

type OffchainHelperAddresses =
    | typeof ETHEREUM_OFFCHAIN_HELPER
    | typeof ARBITRUM_OFFCHAIN_HELPER
    | typeof BSC_OFFCHAIN_HELPER
    | typeof OPTIMISM_OFFCHAIN_HELPER;

const FILENAME = './src/common/ContractAddresses/data.ts';

function transformData(data: CoreAddresses, offchainHelper: OffchainHelperAddresses | undefined): ContractAddresses {
    const res: ContractAddresses = {
        PENDLE: toAddress(data.PENDLE),
        ROUTER: toAddress(data.router),
        ROUTER_STATIC: toAddress(data.routerStatic),
        VEPENDLE: toAddress(data.vePendle),
        PENDLE_SWAP: toAddress(data.pendleSwap),
        WRAPPED_NATIVE: toAddress(data.network.wrappedNative),
        ROUTER_HELPER: toAddress(data.routerHelper),
        PENDLE_MULTICALL: toAddressOrUndefined(offchainHelper?.multicall),
        PENDLE_MULTICALLV2: toAddressOrUndefined(offchainHelper?.pendleMulticallV2),
        VOTING_CONTROLLER: undefined,
        FEE_DISTRIBUTOR: undefined,
        FEE_DISTRIBUTORV2: undefined,
    };

    if ('votingController' in data) {
        res.VOTING_CONTROLLER = toAddress(data.votingController);
    }

    if ('feeDistributor' in data) {
        res.FEE_DISTRIBUTOR = toAddress(data.feeDistributor);
    }

    if ('feeDistributorV2' in data) {
        res.FEE_DISTRIBUTORV2 = toAddress(data.feeDistributorV2);
    }

    return res;
}

function dataToString(name: string, data: ContractAddresses): string {
    return `export const ${name} = {
        ${Object.entries(data)
            // move undefined down
            .sort((u, v) => {
                const uHasValue = !!u[1];
                const vHasValue = !!v[1];
                if (uHasValue == vHasValue) return u[0].localeCompare(v[0]);
                return -(+uHasValue - +vHasValue);
            })
            .map(([key, value]) => `${key}: ${value ? `toAddress(${JSON.stringify(value)})` : 'undefined'}`)
            .join(',\n')}
    } as const satisfies ContractAddresses;\n`;
}

const content = `
// This file is generated via \`yarn generateContractAddresses\`
// Generated at ${new Date().toUTCString()}
import { ContractAddresses } from './types';
import { toAddress } from '../Address';

${dataToString('ETHEREUM_CORE_ADDRESSES', transformData(ETHEREUM_CORE_ADDRESSES, ETHEREUM_OFFCHAIN_HELPER))};
${dataToString('ARBITRUM_CORE_ADDRESSES', transformData(ARBITRUM_CORE_ADDRESSES, ARBITRUM_OFFCHAIN_HELPER))};
${dataToString('BSC_CORE_ADDRESSES', transformData(BSC_CORE_ADDRESSES, BSC_OFFCHAIN_HELPER))};
${dataToString('MANTLE_CORE_ADDRESSES', transformData(MANTLE_CORE_ADDRESSES, undefined))};
${dataToString('OPTIMISM_CORE_ADDRESSES', transformData(OPTIMISM_CORE_ADDRESSES, OPTIMISM_OFFCHAIN_HELPER))};

${dataToString('FUJI_CORE_ADDRESSES', transformData(FUJI_CORE_ADDRESSES, undefined))};
${dataToString('MUMBAI_CORE_ADDRESSES', transformData(MUMBAI_CORE_ADDRESSES, undefined))};
`;

writeTsThenFormat(FILENAME, content)
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
