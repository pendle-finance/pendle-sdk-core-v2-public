import * as pendleSDK from '../../../src';
import fs from 'fs';
import * as iters from 'itertools';
import { cachifyBuiltinOnly } from '../cachify';

import { getLookupFilePath, getAllFilePath } from './filePath';
import { MarketData } from './types';
export * from './types';
export * from './filePath';

export function lookupFromFile(filePath: string, defaultDisableTesting: boolean): MarketData {
    const dataStr = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const data = JSON.parse(dataStr) as MarketData<false>;
    for (const tokens of [data.tokensIn, data.tokensOut, data.rewardTokens]) {
        for (const token of tokens) {
            token.disableTesting ??= defaultDisableTesting;
        }
    }
    // If not casting to unknown, TS will complain.
    return data as unknown as MarketData;
}

export function lookup(
    marketAddress: pendleSDK.Address,
    chainId: pendleSDK.ChainId,
    defaultDisableTesting: boolean
): MarketData {
    try {
        const filePath = getLookupFilePath(marketAddress, chainId);
        return lookupFromFile(filePath, defaultDisableTesting);
    } catch (e) {
        const errorMessage = [
            `Error while look up market data for market ${marketAddress} on chain ${chainId}`,
            'If the market data is does not exist, call the following command to generate new data for the market:',
            '',
            `ACTIVE_CHAIN_ID=${chainId} MARKET_ADDRESS=${marketAddress} yarn generateMarketTestData`,
        ].join('\n');
        throw new Error(errorMessage, { cause: e });
    }
}

export const getAllMarketData = cachifyBuiltinOnly(
    (chainId: pendleSDK.ChainId, defaultDisableTesting: boolean): MarketData[] => {
        return getAllFilePath(chainId).map((path) => lookupFromFile(path, defaultDisableTesting));
    }
);

export const getAnyExiredMarket = cachifyBuiltinOnly(
    (chainId: pendleSDK.ChainId, defaultDisableTesting: boolean): MarketData | undefined => {
        const allData = getAllMarketData(chainId, defaultDisableTesting);
        const nowMs = Date.now();
        return iters.find(allData, (marketData) => marketData.expiry_ms < nowMs);
    }
);
