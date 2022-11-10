import { SDK } from '../src/entities/SDK';
import { MarketEntity, PtEntity, SyEntity, YtEntity, Multicall, decimalFactor, toAddress, BN } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe(SDK, () => {
    const sdk = new SDK(ACTIVE_CHAIN_ID, networkConnection);

    const marketAddress = currentConfig.market.market;
    const syAddress = currentConfig.market.SY;
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;

    const pt = new PtEntity(ptAddress, ACTIVE_CHAIN_ID, networkConnection);
    const yt = new YtEntity(ytAddress, ACTIVE_CHAIN_ID, networkConnection);
    const market = new MarketEntity(marketAddress, ACTIVE_CHAIN_ID, networkConnection);
    const sy = new SyEntity(syAddress, ACTIVE_CHAIN_ID, networkConnection);

    it('#constructor', async () => {
        expect(sdk).toBeInstanceOf(SDK);
        expect(sdk.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    describeWithMulticall((multicall) => {
        it('#getUserPYPositionsByPYs', async () => {
            const [userPYPositions, userPtBalance, userYtBalance, interestToken, interestAmount] = await Promise.all([
                sdk.getUserPYPositionsByPYs(currentConfig.deployer, [ytAddress, ptAddress], { multicall }),
                pt.balanceOf(currentConfig.deployer, { multicall }),
                yt.balanceOf(currentConfig.deployer, { multicall }),
                Multicall.wrap(yt.contract, multicall).callStatic.SY().then(toAddress),
                Multicall.wrap(yt.contract, multicall).callStatic.userInterest(currentConfig.deployer),
            ]);

            expect(userPYPositions[0]).toEqual(userPYPositions[1]);
            const userInfo = userPYPositions[0];

            expect(userInfo.pt).toBe(ptAddress);
            expect(userInfo.ptBalance).toEqBN(userPtBalance);

            expect(userInfo.yt).toBe(ytAddress);
            expect(userInfo.ytBalance).toEqBN(userYtBalance);

            const interest = userInfo.unclaimedInterest;
            expect(interest.token).toBe(interestToken);
            expect(interest.amount).toEqBN(interestAmount[1]);

            const reward = userInfo.unclaimedRewards;

            const amountExpected = await Promise.all(
                reward.map(
                    async (token) =>
                        (
                            await Multicall.wrap(yt.contract, multicall).callStatic.userReward(
                                token.token,
                                currentConfig.deployer
                            )
                        )[1]
                )
            );
            const amountActual = reward.map((token) => token.amount);
            expect(amountActual).toEqual(amountExpected);
        });

        it('#userPositionMarket', async () => {
            const [userPositionMarket, marketInfo, userBalance, syInfo, syExchangeRate] = await Promise.all([
                sdk.getUserMarketPositions(currentConfig.deployer, [currentConfig.marketAddress], { multicall }),
                market.getMarketInfo({ multicall }),
                Multicall.wrap(market.contract, multicall).callStatic.balanceOf(currentConfig.deployer),
                sy.contract.assetInfo(),
                sy.contract.exchangeRate(),
            ]);

            expect(userPositionMarket).toBeDefined();

            const userMarketInfo = userPositionMarket[0];

            expect(userMarketInfo.market).toBe(currentConfig.marketAddress);

            expect(userMarketInfo.lpBalance).toEqBN(userBalance);

            expect(userMarketInfo.ptBalance.token).toBe(ptAddress);
            expect(userMarketInfo.ptBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp)
            );

            expect(userMarketInfo.syBalance.token).toBe(syAddress);
            expect(userMarketInfo.syBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalSy).div(marketInfo.state.totalLp)
            );

            expect(userMarketInfo.assetBalance.assetType).toEqBN(BN.from(syInfo.assetType));
            expect(userMarketInfo.assetBalance.assetAddress).toBe(toAddress(syInfo.assetAddress));
            expect(userMarketInfo.assetBalance.amount).toEqBN(
                userMarketInfo.syBalance.amount.mul(syExchangeRate).div(decimalFactor(18))
            );
        });
    });
});
