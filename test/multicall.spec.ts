import { PendleERC20, ERC20, SyEntity, decimalFactor, Address, zip, toAddress } from '../src';
import { BigNumber as BN, ethers } from 'ethers';
import { MarketEntity, PtEntity, WrappedContract } from '../src';
import './util/bigNumberMatcher.ts';
import { currentConfig, networkConnection } from './util/testEnv';

describe('Multicall', () => {
    const chainId = currentConfig.chainId;
    const multicall = currentConfig.multicall;
    let market: MarketEntity;
    let pt: WrappedContract<PendleERC20>,
        yt: WrappedContract<PendleERC20>,
        sy: WrappedContract<PendleERC20>,
        dummy: WrappedContract<PendleERC20>;

    beforeAll(async () => {
        market = new MarketEntity(currentConfig.marketAddress, chainId, networkConnection);
        const marketInfo = await market.getMarketInfo();
        pt = new ERC20(marketInfo.pt, chainId, networkConnection).contract;
        yt = (await new PtEntity(marketInfo.pt, chainId, networkConnection).ytEntity()).contract;
        sy = new ERC20(marketInfo.sy, chainId, networkConnection).contract;
        dummy = new ERC20(ethers.constants.AddressZero, chainId, networkConnection).contract;
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

    it('by block tags', async () => {
        const currentBlock = await networkConnection.provider.getBlockNumber();
        const syContract = new SyEntity(currentConfig.market.SY, currentConfig.chainId, networkConnection).contract;

        const tokensIn = (await syContract.getTokensIn()).map(toAddress);
        const tokensOut = (await syContract.getTokensOut()).map(toAddress);

        const getOne = async (token: Address) => {
            const decimals = await new ERC20(token, currentConfig.chainId, networkConnection).decimals();
            return decimalFactor(decimals);
        };

        const [tokenInAmountToDeposits, tokensOutAmountToRedeem] = await Promise.all([
            Promise.all(tokensIn.map(getOne)),
            Promise.all(tokensOut.map(getOne)),
        ]);

        const promiseCalls: Promise<BN>[] = [];
        const multicalls: Promise<BN>[] = [];

        for (let i = 0; i < 10 && i <= currentBlock; ++i) {
            const testBlock = currentBlock - i;

            const overrides = { blockTag: testBlock } as const;
            for (const [token, amount] of zip(tokensIn, tokenInAmountToDeposits)) {
                promiseCalls.push(syContract.callStatic.previewDeposit(token, amount, overrides));
                multicalls.push(multicall.wrap(syContract).callStatic.previewDeposit(token, amount, overrides));
            }

            for (const [token, amount] of zip(tokensOut, tokensOutAmountToRedeem)) {
                promiseCalls.push(syContract.callStatic.previewRedeem(token, amount, overrides));
                multicalls.push(multicall.wrap(syContract).callStatic.previewRedeem(token, amount, overrides));
            }
        }
        const [promiseCallResults, multicallResults] = await Promise.all([
            Promise.all(promiseCalls),
            Promise.all(multicalls),
        ]);

        // print({ testBlock, promiseCallResults, multicallResults });
        for (const [promiseCallResult, multicallResult] of zip(promiseCallResults, multicallResults)) {
            expect(multicallResult).toEqBN(promiseCallResult);
        }
    });
});
