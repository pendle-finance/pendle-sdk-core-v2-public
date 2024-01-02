import * as pendleSDK from '../../../src';

export function getLookupFilePath(chainId: pendleSDK.ChainId) {
    return `./test/data/${chainId}/zappable-tokens.json`;
}
