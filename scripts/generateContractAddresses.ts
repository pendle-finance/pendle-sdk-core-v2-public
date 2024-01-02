import ETHEREUM_CORE_ADDRESSES from '@pendle/core-v2/deployments/1-core.json';
import ARBITRUM_CORE_ADDRESSES from '@pendle/core-v2/deployments/42161-core.json';
import BSC_CORE_ADDRESSES from '@pendle/core-v2/deployments/56-core.json';
import MANTLE_CORE_ADDRESSES from '@pendle/core-v2/deployments/5000-core.json';
import OPTIMISM_CORE_ADDRESSES from '@pendle/core-v2/deployments/10-core.json';

import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-core.json';

import ETHEREUM_OFFCHAIN_HELPER from '@pendle/core-v2/deployments/1-offchain-helper.json';
import ARBITRUM_OFFCHAIN_HELPER from '@pendle/core-v2/deployments/42161-offchain-helper.json';
import BSC_OFFCHAIN_HELPER from '@pendle/core-v2/deployments/56-offchain-helper.json';
import OPTIMISM_OFFCHAIN_HELPER from '@pendle/core-v2/deployments/10-offchain-helper.json';

import { toAddress, Address } from '../src/common/Address';
import { ContractAddresses } from '../src/common/ContractAddresses/types';
import { writeTsThenFormat } from './writeTsThenFormat';
import { ethers } from 'ethers';

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

const ADDRESS_REGEX = /(0x[0-9a-fA-F]{40})/g;

type FileFieldContext = {
    fileName: string;
    fieldName: string;
};

function tryParseAddress(address: string, context: FileFieldContext): Address {
    const resArr = address.match(ADDRESS_REGEX);
    const formattedContext = `(File ${context.fileName}, field ${context.fieldName})`;
    if (resArr == null) {
        throw new Error(`${JSON.stringify(address)} is does not match address regex ${formattedContext}`);
    }
    const res = resArr[0];
    if (res !== address) {
        console.warn(
            `Part of ${JSON.stringify(address)} matched address regex, but not the whole string ${formattedContext}`
        );
    }
    if (res !== ethers.utils.getAddress(res.toLowerCase())) {
        console.warn(`${JSON.stringify(res)} does not satisfy checksum ${formattedContext}`);
    }
    return toAddress(res);
}

function tryParseAddressOrUndefined(
    address: string | undefined | null,
    context: FileFieldContext
): Address | undefined {
    if (!address) return undefined;
    return tryParseAddress(address, context);
}

function transformData(
    fileName: string,
    data: CoreAddresses,
    offchainHelper: OffchainHelperAddresses | undefined
): ContractAddresses {
    const res: ContractAddresses = {
        PENDLE: tryParseAddress(data.PENDLE, { fileName, fieldName: 'PENDLE' }),
        ROUTER: tryParseAddress(data.router, { fileName, fieldName: 'router' }),
        ROUTER_STATIC: tryParseAddress(data.routerStatic, { fileName, fieldName: 'routerStatic' }),
        VEPENDLE: tryParseAddress(data.vePendle, { fileName, fieldName: 'vePendle' }),
        PENDLE_SWAP: tryParseAddress(data.pendleSwap, { fileName, fieldName: 'pendleSwap' }),
        WRAPPED_NATIVE: tryParseAddress(data.network.wrappedNative, { fileName, fieldName: 'wrappedNative' }),
        ROUTER_HELPER: tryParseAddress(data.routerHelper, { fileName, fieldName: 'routerHelper' }),
        PENDLE_MULTICALL: tryParseAddressOrUndefined(offchainHelper?.multicall, {
            fileName: `${fileName} (offchainHelper)`,
            fieldName: 'multicall',
        }),
        PENDLE_MULTICALLV2: tryParseAddressOrUndefined(offchainHelper?.pendleMulticallV2, {
            fileName: `${fileName} (offchainHelper}`,
            fieldName: 'pendleMulticallV2',
        }),
        VOTING_CONTROLLER: undefined,
        FEE_DISTRIBUTOR: undefined,
        FEE_DISTRIBUTORV2: undefined,
        LIMIT_ROUTER: undefined,
        ARB_MERKLE_DISTRIBUTION: undefined,
    };

    if ('votingController' in data) {
        res.VOTING_CONTROLLER = tryParseAddress(data.votingController, { fileName, fieldName: 'votingController' });
    }

    if ('feeDistributor' in data) {
        res.FEE_DISTRIBUTOR = tryParseAddress(data.feeDistributor, { fileName, fieldName: 'feeDistributor' });
    }

    if ('feeDistributorV2' in data) {
        res.FEE_DISTRIBUTORV2 = tryParseAddress(data.feeDistributorV2, { fileName, fieldName: 'feeDistributorV2' });
    }

    if ('limitRouter' in data) {
        res.LIMIT_ROUTER = tryParseAddress(data.limitRouter, { fileName, fieldName: 'limitRouter' });
    }

    if ('arbMerkleDistribution' in data) {
        res.ARB_MERKLE_DISTRIBUTION = toAddress(data.arbMerkleDistribution);
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

${dataToString('ETHEREUM_CORE_ADDRESSES', transformData('1-core', ETHEREUM_CORE_ADDRESSES, ETHEREUM_OFFCHAIN_HELPER))};
${dataToString(
    'ARBITRUM_CORE_ADDRESSES',
    transformData('42161-core', ARBITRUM_CORE_ADDRESSES, ARBITRUM_OFFCHAIN_HELPER)
)};
${dataToString('BSC_CORE_ADDRESSES', transformData('56-core', BSC_CORE_ADDRESSES, BSC_OFFCHAIN_HELPER))};
${dataToString('MANTLE_CORE_ADDRESSES', transformData('5000-core', MANTLE_CORE_ADDRESSES, undefined))};
${dataToString('OPTIMISM_CORE_ADDRESSES', transformData('10-core', OPTIMISM_CORE_ADDRESSES, OPTIMISM_OFFCHAIN_HELPER))};

${dataToString('FUJI_CORE_ADDRESSES', transformData('43113-core', FUJI_CORE_ADDRESSES, undefined))};
${dataToString('MUMBAI_CORE_ADDRESSES', transformData('80001-core', MUMBAI_CORE_ADDRESSES, undefined))};
`;

writeTsThenFormat(FILENAME, content)
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
