import * as pendleSDK from '../../../src';
import * as ethers from 'ethers';
import fs from 'fs/promises';
import path from 'path';

import { ERC20BalanceSlot, ERC20BalanceSlotMap } from './types';
import { getLookupFilePath } from './filePath';
import { scanSlot } from './scanSlot';
import { lockify } from '../lockify';

const slotMapByChainId: Partial<Record<pendleSDK.ChainId, ERC20BalanceSlotMap>> = {};

async function loadSlotMapImpl(chainId: pendleSDK.ChainId): Promise<ERC20BalanceSlotMap> {
    const preloadedSlotMap = slotMapByChainId[chainId];
    if (preloadedSlotMap) return preloadedSlotMap;

    const file = getLookupFilePath(chainId);

    const slotMapFromFile: ERC20BalanceSlotMap = await fs
        .readFile(file, { encoding: 'utf-8' })
        .then((res) => JSON.parse(res) as ERC20BalanceSlotMap)
        .catch(() => ({} satisfies ERC20BalanceSlotMap));
    slotMapByChainId[chainId] = slotMapFromFile;
    return slotMapFromFile;
}

export const loadSlotMap = lockify(loadSlotMapImpl);

async function saveSlotMapImpl(chainId: pendleSDK.ChainId, slotMap: ERC20BalanceSlotMap) {
    const file = getLookupFilePath(chainId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(slotMap, undefined, 2));
}

export const saveSlotMap = lockify(saveSlotMapImpl);

export async function getSlot(
    chainId: pendleSDK.ChainId,
    address: pendleSDK.Address,
    provider: ethers.providers.JsonRpcProvider
): Promise<ERC20BalanceSlot | undefined> {
    const slotMap = await loadSlotMap(chainId);
    const lookedupResult = slotMap[address];
    if (lookedupResult) return lookedupResult;
    console.log(`ERC20 balance slot not found for token ${address} on chain ${chainId}. Doing scan.`);

    const res = await scanSlot(provider, address);
    if (!res) {
        console.log(`Can not scan balance slot for token ${address} on chain ${chainId}.`);
        return undefined;
    }
    console.log(`Found balance slot for token ${address} on chain ${chainId}: ${JSON.stringify(res)}`);

    slotMap[address] = res;
    await saveSlotMap(chainId, slotMap);
    return res;
}

export * from './types';
export * from './filePath';
export * from './scanSlot';
export * from './slotHandler';
