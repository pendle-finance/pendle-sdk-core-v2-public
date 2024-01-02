import * as pendleSDK from '../../../src';

export function getLookupFilePath(chainId: pendleSDK.ChainId): string {
    return `./test/data/${chainId}/erc20-slots.json`;
}
