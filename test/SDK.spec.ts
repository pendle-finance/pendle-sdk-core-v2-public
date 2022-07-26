import { SDK } from '../src/entities/SDK';
import { Market, PT, SCY, YT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';
import { BigNumber } from 'ethers';
import { decimalFactor } from '../src/entities/helper';

describe(SDK, () => {
    const sdk = new SDK(networkConnection, ACTIVE_CHAIN_ID);
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(sdk).toBeInstanceOf(SDK);
        expect(sdk.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getUserPYPositionsByPYs', async () => {
        const [userPYPositions, userPtBalance, userYtBalance, interestToken, interestAmount] = await Promise.all([
            sdk.getUserPYPositionsByPYs(currentConfig.deployer, [currentConfig.ytAddress, currentConfig.ptAddress]),
            pt.ERC20.balanceOf(currentConfig.deployer),
            yt.ERC20.balanceOf(currentConfig.deployer),
            yt.contract.callStatic.SCY(),
            yt.contract.callStatic.userInterest(currentConfig.deployer),
        ]);

        expect(userPYPositions[0]).toEqual(userPYPositions[1]);
        const userInfo = userPYPositions[0];

        expect(userInfo.pt).toBe(currentConfig.ptAddress);
        expect(userInfo.ptBalance.toBigInt()).toBe(userPtBalance.toBigInt());

        expect(userInfo.yt).toBe(currentConfig.ytAddress);
        expect(userInfo.ytBalance.toBigInt()).toBe(userYtBalance.toBigInt());

        const interest = userInfo.unclaimedInterest;
        expect(interest.token).toBe(interestToken);
        expect(interest.amount.toBigInt()).toBe(interestAmount[1].toBigInt());

        const reward = userInfo.unclaimedRewards;

        const amountExpected = await Promise.all(
            reward.map(
                async (token) => (await yt.contract.callStatic.userReward(token.token, currentConfig.deployer))[1]
            )
        );
        const amountActual = reward.map((token) => token.amount);
        expect(amountActual).toEqual(amountExpected);
    });

    it('#userPositionMarket', async () => {
        const [userPositionMarket, marketInfo, userBalance, scyInfo, scyExchangeRate] = await Promise.all([
            sdk.getUserMarketPositions(currentConfig.deployer, [currentConfig.marketAddress]),
            market.getMarketInfo(),
            market.contract.callStatic.balanceOf(currentConfig.deployer),
            scy.contract.assetInfo(),
            scy.contract.exchangeRate(),
        ]);

        expect(userPositionMarket).toBeDefined();

        const userMarketInfo = userPositionMarket[0];

        expect(userMarketInfo.market).toBe(currentConfig.marketAddress);

        expect(userMarketInfo.lpBalance.toBigInt()).toBe(userBalance.toBigInt());

        expect(userMarketInfo.ptBalance.token).toBe(currentConfig.ptAddress);
        expect(userMarketInfo.ptBalance.amount.toBigInt()).toBe(
            userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp).toBigInt()
        );

        expect(userMarketInfo.scyBalance.token).toBe(currentConfig.scyAddress);
        expect(userMarketInfo.scyBalance.amount.toBigInt()).toBe(
            userBalance.mul(marketInfo.state.totalScy).div(marketInfo.state.totalLp).toBigInt()
        );

        expect(userMarketInfo.assetBalance.assetType).toBe(scyInfo.assetType);
        expect(userMarketInfo.assetBalance.assetAddress).toBe(scyInfo.assetAddress);
        expect((userMarketInfo.assetBalance.amount as BigNumber).toBigInt()).toBe(
            userMarketInfo.scyBalance.amount.mul(scyExchangeRate).div(decimalFactor(18)).toBigInt()
        );
    });
});
