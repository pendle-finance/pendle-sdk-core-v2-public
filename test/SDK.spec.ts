import { SDK } from '../src/entities/SDK';
import { MarketEntity, PtEntity, ScyEntity, YtEntity, Multicall } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, describeWithMulticall } from './util/testUtils';
import { decimalFactor } from '../src/entities/helper';
import './util/bigNumberMatcher';

describe(SDK, () => {
    const sdk = new SDK(networkConnection, ACTIVE_CHAIN_ID);

    const marketAddress = currentConfig.market.market;
    const scyAddress = currentConfig.market.SCY;
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;

    const pt = new PtEntity(ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new YtEntity(ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const market = new MarketEntity(marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new ScyEntity(scyAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(sdk).toBeInstanceOf(SDK);
        expect(sdk.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    describeWithMulticall((multicall) => {
        it('#getUserPYPositionsByPYs', async () => {
            const [userPYPositions, userPtBalance, userYtBalance, interestToken, interestAmount] = await Promise.all([
                sdk.getUserPYPositionsByPYs(currentConfig.deployer, [ytAddress, ptAddress], multicall),
                pt.ERC20.balanceOf(currentConfig.deployer, multicall),
                yt.ERC20.balanceOf(currentConfig.deployer, multicall),
                Multicall.wrap(yt.contract, multicall).callStatic.SCY(),
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
            const [userPositionMarket, marketInfo, userBalance, scyInfo, scyExchangeRate] = await Promise.all([
                sdk.getUserMarketPositions(currentConfig.deployer, [currentConfig.marketAddress], multicall),
                market.getMarketInfo(multicall),
                Multicall.wrap(market.contract, multicall).callStatic.balanceOf(currentConfig.deployer),
                scy.contract.assetInfo(),
                scy.contract.exchangeRate(),
            ]);

            expect(userPositionMarket).toBeDefined();

            const userMarketInfo = userPositionMarket[0];

            expect(userMarketInfo.market).toBe(currentConfig.marketAddress);

            expect(userMarketInfo.lpBalance).toEqBN(userBalance);

            expect(userMarketInfo.ptBalance.token).toBe(ptAddress);
            expect(userMarketInfo.ptBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp)
            );

            expect(userMarketInfo.scyBalance.token).toBe(scyAddress);
            expect(userMarketInfo.scyBalance.amount).toEqBN(
                userBalance.mul(marketInfo.state.totalScy).div(marketInfo.state.totalLp)
            );

            expect(userMarketInfo.assetBalance.assetType).toBe(scyInfo.assetType);
            expect(userMarketInfo.assetBalance.assetAddress).toBe(scyInfo.assetAddress);
            expect(userMarketInfo.assetBalance.amount).toEqBN(
                userMarketInfo.scyBalance.amount.mul(scyExchangeRate).div(decimalFactor(18))
            );
        });
    });
});
