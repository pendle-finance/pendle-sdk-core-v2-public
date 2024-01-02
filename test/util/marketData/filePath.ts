import * as pendleSDK from '../../../src';
import fs from 'fs';
import path from 'path';

export const getBaseDirForChain = (chainId: pendleSDK.ChainId) => `./test/data/${chainId}/market-data`;

export function getLookupFilePath(marketAddress: pendleSDK.Address, chainId: pendleSDK.ChainId) {
    return `${getBaseDirForChain(chainId)}/${marketAddress}.json`;
}

export function getAllFilePath(chainId: pendleSDK.ChainId): string[] {
    const dir = getBaseDirForChain(chainId);
    return fs.readdirSync(dir).map((file) => path.join(dir, file));
}
