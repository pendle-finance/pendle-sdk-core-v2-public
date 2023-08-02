import { abi as PendleContractErrorsAbi } from '@pendle/core-v2/build/artifacts/contracts/offchain-helpers/errors/SDKErrorsDirectory.sol/SDKErrorsDirectory.json';
import { writeTsThenFormat } from './writeTsThenFormat';

const FILENAME = './src/PendleContractErrorMessages/type.ts';
const lines = [];

lines.push(`
// This file is generated via \`yarn generatePendleContractErrorMessageHandler\`
import { type BigNumber as BN, BytesLike } from 'ethers';
import { Address } from '../common';

/**
 * This type is generated from the ABI of Pendle contract Errors.
 *
 * @see https://github.com/pendle-finance/pendle-core-v2/blob/6626a0c5daae59d10008375c7b0772affe0cf8ac/contracts/offchain-helpers/errors/SDKErrorsDirectory.sol
 */
`);
lines.push('export type PendleContractErrorMessageHandler = {');

function abiPrimitiveTypeToTypescript(t: string) {
    if (t === 'address') {
        return 'Address';
    }
    if (/^u?int\d{1,3}$/.test(t)) {
        return 'BN';
    }
    if (/^bytes\d+$/.test(t)) {
        return 'BytesLike';
    }
    return undefined;
}

for (const fragment of PendleContractErrorsAbi) {
    if (fragment.type !== 'error') {
        continue;
    }
    lines.push(
        `\t${fragment.name}: (${fragment.inputs
            .map((input) => `${input.name}: ${abiPrimitiveTypeToTypescript(input.type)}`)
            .join(', ')}) => string;`
    );
}

lines.push('};');

writeTsThenFormat(FILENAME, lines.join('\n'));
