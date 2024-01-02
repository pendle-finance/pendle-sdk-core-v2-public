import * as pendleSDK from '../../../src';
import * as iters from 'itertools';
import { setERC20Balance, getERC20BalanceFromStorage } from './slotHandler';
import * as ethers from 'ethers';
import { ERC20BalanceSlot } from './types';
import { lockify } from '../lockify';

async function scanSlotImpl(
    provider: ethers.providers.JsonRpcProvider,
    tokenAddress: pendleSDK.Address,
    options?: {
        iteration?: number;
        maxSlot?: number;
        maxValue?: number;
        holderAddress?: pendleSDK.Address;
    }
): Promise<ERC20BalanceSlot | undefined> {
    if (pendleSDK.isNativeToken(tokenAddress)) return undefined;
    const {
        iteration = 3,
        maxSlot = 100,
        maxValue = 1e9,
        holderAddress = pendleSDK.NATIVE_ADDRESS_0x00,
    } = options ?? {};

    const erc20Entity = pendleSDK.createERC20(tokenAddress, {
        provider,

        // ChainID is not important here. We only need the ERC20 entity to have the `balanceOf` method.
        chainId: pendleSDK.CHAIN_ID_MAPPING.ETHEREUM,
    });

    async function checkSlot(slot: ERC20BalanceSlot): Promise<boolean> {
        const oldSlotValue = await getERC20BalanceFromStorage(tokenAddress, holderAddress, slot, provider);
        try {
            for (const _ of iters.range(iteration)) {
                const value = pendleSDK.BN.from(Math.floor(Math.random() * maxValue));
                await setERC20Balance(tokenAddress, holderAddress, value, slot, provider);
                const b = await erc20Entity.balanceOf(holderAddress);
                if (!b.eq(value)) return false;
            }
            return true;
        } finally {
            await setERC20Balance(tokenAddress, holderAddress, oldSlotValue, slot, provider).catch(() => {});
        }
    }

    for (const slot of iters.range(maxSlot)) {
        for (const reverse of [false, true]) {
            // console.log(`Try slot ${slot} ${reverse} for ${tokenAddress}`);
            if (await checkSlot([slot, reverse])) return [slot, reverse];
        }
    }
    return undefined;
}

export const scanSlot = lockify(scanSlotImpl);
