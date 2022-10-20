import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { ERC20 } from '../src';
import { BigNumber as BN, ethers } from 'ethers';
import { MarketEntity, PtEntity, WrappedContract } from '../src';
import './util/bigNumberMatcher.ts';
import { currentConfig, networkConnection } from './util/testUtils';

describe('Multicall', () => {
    const chainId = currentConfig.chainId;
    const multicall = currentConfig.multicall;
    let market: MarketEntity;
    let pt: WrappedContract<PendleERC20>,
        yt: WrappedContract<PendleERC20>,
        sy: WrappedContract<PendleERC20>,
        dummy: WrappedContract<PendleERC20>;

    beforeAll(async () => {
        market = new MarketEntity(currentConfig.marketAddress, networkConnection, chainId);
        const marketInfo = await market.getMarketInfo();
        pt = new ERC20(marketInfo.pt, networkConnection, chainId).ERC20Contract;
        yt = new ERC20(await new PtEntity(marketInfo.pt, networkConnection, chainId).YT(), networkConnection, chainId)
            .ERC20Contract;
        sy = new ERC20(marketInfo.sy, networkConnection, chainId).ERC20Contract;
        dummy = new ERC20(ethers.constants.AddressZero, networkConnection, chainId).ERC20Contract;
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
            sy.balanceOf(currentConfig.userAddress),
        ]);

        let multicalls = await Promise.all([
            multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(yt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(sy).callStatic.balanceOf(currentConfig.userAddress),
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
            sy.balanceOf(currentConfig.userAddress),
            Promise.resolve().then(() => BN.from(-1)),
        ]);

        let multicalls = await Promise.all([
            multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(yt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(sy).callStatic.balanceOf(currentConfig.userAddress),
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
