import { Contract } from 'ethers';
import { Market, SCY } from '../src';
import { decimalFactor, getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';
import './util/bigNumberMatcher';

describe(Market, () => {
    const currentMarket = currentConfig.market;
    const market = new Market(currentMarket.market, networkConnection, ACTIVE_CHAIN_ID);
    const contract = market.contract;
    const sender = WALLET().wallet;
    const scy = new SCY(currentMarket.SCY, networkConnection, ACTIVE_CHAIN_ID);
    const routerStatic = getRouterStatic(networkConnection.provider, ACTIVE_CHAIN_ID);

    it('#constructor', () => {
        expect(market).toBeInstanceOf(Market);
        expect(market.address).toBe(currentConfig.marketAddress);
        expect(market.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(market.contract).toBeInstanceOf(Contract);
        expect(market.contract.address).toBe(currentConfig.marketAddress);
    });

    it('#contract', async () => {
        const [totalSupply, tokens, isExpired, rewardTokens, state] = await Promise.all([
            contract.totalSupply(),
            contract.readTokens(),
            contract.isExpired(),
            contract.getRewardTokens(),
            contract.readState(),
        ]);

        expect(totalSupply).toBeGteBN(0);
        expect(tokens._PT).toBe(currentMarket.PT);
        expect(tokens._YT).toBe(currentMarket.YT);
        expect(tokens._SCY).toBe(currentMarket.SCY);
        expect(isExpired).toBe(false);
    });

    it('#marketInfo', async () => {
        const marketInfo = await market.getMarketInfo();
        const exchangerate = await routerStatic.callStatic.getExchangeRate(market.address);

        expect(marketInfo.pt).toBe(currentMarket.PT);
        expect(marketInfo.scy).toBe(currentMarket.SCY);
        // expect(marketInfo.exchangeRate).toEqBN(exchangerate);
    });

    it('#userMarketInfo', async () => {
        const [marketInfo, userMarketInfo, userBalance, scyInfo, scyExchangeRate] = await Promise.all([
            market.getMarketInfo(),
            market.getUserMarketInfo(sender.address),
            market.contract.callStatic.balanceOf(sender.address),
            scy.contract.assetInfo(),
            scy.contract.exchangeRate(),
        ]);

        // Verify addresses
        expect(userMarketInfo.market).toBe(currentConfig.marketAddress);
        expect(userMarketInfo.ptBalance.token).toBe(currentMarket.PT);
        expect(userMarketInfo.scyBalance.token).toBe(currentMarket.SCY);

        // Verify lp balance
        expect(userMarketInfo.lpBalance).toEqBN(userBalance);
        expect(userMarketInfo.ptBalance.amount).toEqBN(
            userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp)
        );
        expect(userMarketInfo.scyBalance.amount).toEqBN(
            userBalance.mul(marketInfo.state.totalScy).div(marketInfo.state.totalLp)
        );

        // Verify underlying balance
        expect(userMarketInfo.assetBalance.assetType).toBe(scyInfo.assetType);
        expect(userMarketInfo.assetBalance.assetAddress).toBe(scyInfo.assetAddress);
        expect(userMarketInfo.assetBalance.amount).toEqBN(
            userMarketInfo.scyBalance.amount.mul(scyExchangeRate).div(decimalFactor(18))
        );
    });
});
