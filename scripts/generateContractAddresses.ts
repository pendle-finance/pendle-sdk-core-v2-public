import ETHEREUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-core.json';
import ARBITRUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/42161-core.json';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-core.json';
import BSC_CORE_ADDRESSES from '@pendle/core-v2/deployments/56-core.json';

import { toAddress, toAddressOrUndefined } from '../src/common/Address';
import { ContractAddresses } from '../src/common/ContractAddresses/types';
import { writeTsThenFormat } from './writeTsThenFormat';

type CoreAddresses =
    | typeof ETHEREUM_CORE_ADDRESSES
    | typeof ARBITRUM_CORE_ADDRESSES
    | typeof FUJI_CORE_ADDRESSES
    | typeof MUMBAI_CORE_ADDRESSES
    | typeof BSC_CORE_ADDRESSES;

const FILENAME = './src/common/ContractAddresses/data.ts';

function transformData(data: CoreAddresses): ContractAddresses {
    const res: ContractAddresses = {
        PENDLE: toAddress(data.PENDLE),
        ROUTER: toAddress(data.router),
        ROUTER_STATIC: toAddress(data.routerStatic),
        VEPENDLE: toAddress(data.vePendle),
        PENDLE_SWAP: toAddress(data.pendleSwap),
        WRAPPED_NATIVE: toAddress(data.network.wrappedNative),
        ROUTER_HELPER: toAddress(data.routerHelper),
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
    return `export const ${name}: ContractAddresses = {
        ${Object.entries(data)
            .map(([key, value]) => `${key}: toAddress(${JSON.stringify(value)})`)
            .join(',\n')}
    }`;
}

const content = `
// This file is generated via \`yarn generateContractAddresses\`
// Generated at ${new Date().toUTCString()}
import { ContractAddresses } from './types';
import { toAddress } from '../Address';

${dataToString('ETHEREUM_CORE_ADDRESSES', transformData(ETHEREUM_CORE_ADDRESSES))};
${dataToString('FUJI_CORE_ADDRESSES', transformData(FUJI_CORE_ADDRESSES))};
${dataToString('MUMBAI_CORE_ADDRESSES', transformData(MUMBAI_CORE_ADDRESSES))};
${dataToString('ARBITRUM_CORE_ADDRESSES', transformData(ARBITRUM_CORE_ADDRESSES))};
${dataToString('BSC_CORE_ADDRESSES', transformData(BSC_CORE_ADDRESSES))};
`;

writeTsThenFormat(FILENAME, content)
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
