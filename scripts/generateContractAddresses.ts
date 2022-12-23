import ETHEREUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-core.json';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-core.json';
import { toAddress } from '../src/common';
import { ContractAddresses } from '../src/common/ContractAddresses';
import { writeTsThenFormat } from './writeTsThenFormat';

const FILENAME = './src/common/ContractAddresses/data.ts';
const lines = [];

lines.push(`
// This file is generated via \`yarn generateContractAddresses\`
import { ContractAddresses } from './types';
`);

function transformData(data: any): ContractAddresses {
    return {
        PENDLE: toAddress(data.PENDLE),
        ROUTER: toAddress(data.router),
        ROUTER_STATIC: toAddress(data.routerStatic),
        VEPENDLE: toAddress(data.vePendle),
        VOTING_CONTROLLER: data.votingController != undefined? toAddress(data.votingController) : undefined,
        FEE_DISTRIBUTOR: data.feeDistributor != undefined? toAddress(data.feeDistributor) : undefined,
    };
}

function genData(varName: string, data: any) {
    const transformedData = transformData(data);
    lines.push(`export const ${varName}: ContractAddresses = {`);
    for (const [key, val] of Object.entries(transformedData)) {
        if (val == undefined) {
            continue;
        }
        lines.push(`    ${key}: '${val}',`);
    }
    lines.push('}');
}

genData('ETHEREUM_CORE_ADDRESSES', ETHEREUM_CORE_ADDRESSES);
genData('FUJI_CORE_ADDRESSES', FUJI_CORE_ADDRESSES);
genData('MUMBAI_CORE_ADDRESSES', MUMBAI_CORE_ADDRESSES);

writeTsThenFormat(FILENAME, lines.join('\n'));
