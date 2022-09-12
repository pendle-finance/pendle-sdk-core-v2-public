import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { ERC20 } from '../src';
import { BigNumber as BN, ethers } from 'ethers';
import { Market, PT } from '../src';
import './util/bigNumberMatcher.ts';
import { currentConfig, networkConnection } from './util/testUtils';

describe('Multicall', () => {
    const chainId = currentConfig.chainId;
    const multicall = currentConfig.multicall;
    let market: Market;
    let pt: PendleERC20, yt: PendleERC20, scy: PendleERC20, dummy: PendleERC20;

    beforeAll(async () => {
        market = new Market(currentConfig.marketAddress, networkConnection, chainId);
        const marketInfo = await market.getMarketInfo();
        pt = new ERC20(marketInfo.pt, networkConnection, chainId).contract;
        yt = new ERC20(await new PT(marketInfo.pt, networkConnection, chainId).YT(), networkConnection, chainId)
            .contract;
        scy = new ERC20(marketInfo.scy, networkConnection, chainId).contract;
        dummy = new ERC20(ethers.constants.AddressZero, networkConnection, chainId).contract;
    });

    it('Single call', async () => {
        expect(await pt.balanceOf(currentConfig.userAddress)).toEqBN(
            await multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress)
        );
    });

    it('Batch call', async () => {
        let promiseCalls = await Promise.all([
            pt.balanceOf(currentConfig.userAddress),
            yt.balanceOf(currentConfig.userAddress),
            scy.balanceOf(currentConfig.userAddress),
        ]);

        let multicalls = await Promise.all([
            multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(yt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(scy).callStatic.balanceOf(currentConfig.userAddress),
        ]);

        for (let i = 0; i < promiseCalls.length; i++) {
            expect(promiseCalls[i]).toEqBN(multicalls[i]);
        }
    });

    it('Error handler', async () => {
        expect(multicall.wrap(dummy).callStatic.balanceOf(currentConfig.userAddress)).rejects.toThrow();

        let result = await multicall
            .wrap(dummy)
            .callStatic.balanceOf(currentConfig.userAddress)
            .catch(() => {
                return BN.from(-1);
            });
        expect(result).toEqBN(-1);
    });

    it('Error handler in batch', async () => {
        let promiseCalls = await Promise.all([
            pt.balanceOf(currentConfig.userAddress),
            yt.balanceOf(currentConfig.userAddress),
            scy.balanceOf(currentConfig.userAddress),
            Promise.resolve().then(() => BN.from(-1)),
        ]);

        let multicalls = await Promise.all([
            multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(yt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(scy).callStatic.balanceOf(currentConfig.userAddress),
            multicall
                .wrap(dummy)
                .callStatic.balanceOf(currentConfig.userAddress)
                .catch(() => BN.from(-1)),
        ]);

        for (let i = 0; i < promiseCalls.length; i++) {
            expect(promiseCalls[i]).toEqBN(multicalls[i]);
        }
    });

    it('Stress test', async () => {
        let calls = [];
        for (let i = 0; i < 100; i++) {
            calls.push(multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress));
        }
        await Promise.all(calls);
    });
});
