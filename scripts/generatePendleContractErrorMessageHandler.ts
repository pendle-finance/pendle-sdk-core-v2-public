import { abi as PendleContractErrorsAbi } from '@pendle/core-v2/build/artifacts/contracts/core/libraries/Errors.sol/Errors.json';
import { spawnSync } from 'child_process';

import fs from 'fs';

const FILENAME = './src/PendleContractErrorMessages/type.ts';
const lines = [];

lines.push(`
// This file is generated via \`yarn generatePendleContractErrorMessageHandler\`
import { type BigNumber as BN, BytesLike } from 'ethers';
import { Address } from '../types';
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

fs.writeFile(FILENAME, lines.join('\n'), (err) => {
    if (err) throw err;
    spawnSync('yarn', ['prettier', '--write', FILENAME], { shell: true, stdio: 'inherit' });
});
