/* eslint-disable no-console */
import * as pendleSDK from '../../../src';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

// const PENDLE_API_ALL_ASSETS_URL = (chainId: ChainId) => `https://staging-api.pendle.finance/core/v1/${chainId}/assets/all`;
const PENDLE_API_ALL_ASSETS_URL = (chainId: pendleSDK.ChainId) =>
    `https://api-v2.pendle.finance/core/v1/${chainId}/assets/all`;

export type PendleAssetNarrowType = {
    chainId: pendleSDK.ChainId;
    address: string;
    decimals: number;
    proName: string;
    price: {
        usd: number;
        acc: number;
    };
    priceUpdatedAt: string;
    zappable: boolean;
};
export type PendleAllAssetsResponse = PendleAssetNarrowType[];

export async function fetchAllAsset(chainId: pendleSDK.ChainId): Promise<PendleAllAssetsResponse> {
    const CACHE_FILE_NAME = `test/.cache/all-asset-result.${chainId}.json`;
    const CACHE_DURATION_ms = 5 * 60_000;

    type CacheFileType = {
        lastFetchedTimestamp: number;
        response: PendleAllAssetsResponse;
    };
    try {
        const file = await fs.readFile(CACHE_FILE_NAME, { encoding: 'utf-8' });
        const content = JSON.parse(file) as CacheFileType;
        if (Date.now() - new Date(content.lastFetchedTimestamp).getTime() < CACHE_DURATION_ms) {
            return content.response;
        }
    } catch (e) {
        console.log('Refetch all token from Pendle backend (for pricing) because of the following error');
        console.log(e);
    }
    const response = await axios.get<PendleAllAssetsResponse>(PENDLE_API_ALL_ASSETS_URL(chainId), {
        headers: { 'Content-Type': 'application/json' },
    });
    await fs.mkdir(path.dirname(CACHE_FILE_NAME), { recursive: true });
    await fs.writeFile(
        CACHE_FILE_NAME,
        JSON.stringify({
            lastFetchedTimestamp: Date.now(),
            response: response.data,
        } satisfies CacheFileType)
    );
    return response.data;
}
