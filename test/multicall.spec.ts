import {
    PendleERC20,
    ERC20Entity,
    SyEntity,
    decimalFactor,
    Address,
    zip,
    toAddress,
    MarketEntity,
    PtEntity,
    WrappedContract,
    NATIVE_ADDRESS_0x00,
    isNativeToken,
    YtEntity,
} from '../src';
import { BigNumber as BN } from 'ethers';
import { currentConfig, networkConnection, networkConnectionWithChainId, USE_HARDHAT_RPC } from './util/testEnv';
import { itWhen, print } from './util/testHelper';
import { DEFAULT_EPSILON } from './util/constants';

describe('Multicall', () => {
    const multicall = currentConfig.multicall;
    let market: MarketEntity;
    let pt: WrappedContract<PendleERC20>,
        yt: WrappedContract<PendleERC20>,
        sy: WrappedContract<PendleERC20>,
        dummy: WrappedContract<PendleERC20>;

    beforeAll(async () => {
        market = new MarketEntity(currentConfig.marketAddress, networkConnectionWithChainId);
        const marketInfo = await market.getMarketInfo();
        pt = new ERC20Entity(marketInfo.pt, networkConnection).contract;
        yt = (await new PtEntity(marketInfo.pt, networkConnectionWithChainId).ytEntity()).contract;
        sy = new ERC20Entity(marketInfo.sy, networkConnection).contract;
        dummy = new ERC20Entity(NATIVE_ADDRESS_0x00, networkConnection).contract;
    });

    it('Caching', async () => {
        expect(multicall.wrap(pt)).toEqual(multicall.cacheWrappedContract.get(pt));
    });

    it('Single call', async () => {
        expect(await sy.balanceOf(yt.address)).toEqBN(await multicall.wrap(sy).callStatic.balanceOf(yt.address));
    });

    it('Batch call', async () => {
        const promiseCalls = await Promise.all([
            pt.balanceOf(currentConfig.userAddress),
            yt.balanceOf(currentConfig.userAddress),
            sy.balanceOf(currentConfig.userAddress),
        ]);

        const multicalls = await Promise.all([
            multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(yt).callStatic.balanceOf(currentConfig.userAddress),
            multicall.wrap(sy).callStatic.balanceOf(currentConfig.userAddress),
        ]);

        for (let i = 0; i < promiseCalls.length; i++) {
            expect(promiseCalls[i]).toEqBN(multicalls[i]);
        }
    });

    it('Error handler', async () => {
        await expect(multicall.wrap(dummy).callStatic.balanceOf(currentConfig.userAddress)).rejects.toThrow();

        const result = await multicall
            .wrap(dummy)
            .callStatic.balanceOf(currentConfig.userAddress)
            .catch(() => {
                return BN.from(-1);
            });
        expect(result).toEqBN(-1);
    });

    it('Error handler in batch', async () => {
        const promiseCalls = await Promise.all([
            pt.balanceOf(currentConfig.userAddress),
            yt.balanceOf(currentConfig.userAddress),
            sy.balanceOf(currentConfig.userAddress),
            Promise.resolve().then(() => BN.from(-1)),
        ]);

        const multicalls = await Promise.all([
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
        const calls = [];
        for (let i = 0; i < 100; i++) {
            calls.push(multicall.wrap(pt).callStatic.balanceOf(currentConfig.userAddress));
        }
        await Promise.all(calls);
    });

    itWhen(!USE_HARDHAT_RPC)('by block tags', async () => {
        const currentBlock = await networkConnection.provider.getBlockNumber();
        const syContract = new SyEntity(currentConfig.market.syAddress, networkConnectionWithChainId).contract;

        const tokensIn = (await syContract.getTokensIn()).map(toAddress).filter((addr) => !isNativeToken(addr));
        const tokensOut = (await syContract.getTokensOut()).map(toAddress).filter((addr) => !isNativeToken(addr));

        const getOne = async (token: Address) => {
            const decimals = await new ERC20Entity(token, networkConnectionWithChainId).decimals();
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

    describe('PendleMulticallV2 no side effect', () => {
        it('Claim user rewards', async () => {
            const currentMarket = currentConfig.market;
            const userAddress = currentConfig.userAddress;
            const yt = new YtEntity(currentMarket.ytAddress, networkConnectionWithChainId);

            const [firstSimulateInterestAndRewards, secondSimulateInterestAndRewards] = await Promise.all([
                multicall.wrap(yt.contract).callStatic.redeemDueInterestAndRewards(userAddress, true, true),
                multicall.wrap(yt.contract).callStatic.redeemDueInterestAndRewards(userAddress, true, true),
            ]);
            print(firstSimulateInterestAndRewards);
            print(secondSimulateInterestAndRewards);

            for (const [first, second] of zip(
                firstSimulateInterestAndRewards.flat(),
                secondSimulateInterestAndRewards.flat()
            )) {
                expect(first).toEqBN(second, DEFAULT_EPSILON);
            }
        });
    });
});
