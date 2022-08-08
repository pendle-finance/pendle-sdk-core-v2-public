import { BigNumber, Contract } from 'ethers';
import { Market, SCY } from '../src';
import { decimalFactor, getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';

describe(Market, () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const contract = market.contract;
    const sender = WALLET().wallet;
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
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
            contract.readState(false),
        ]);

        expect(totalSupply.gte(0)).toBe(true);
        expect(tokens._PT).toBe(currentConfig.ptAddress);
        expect(tokens._YT).toBe(currentConfig.ytAddress);
        expect(tokens._SCY).toBe(currentConfig.scyAddress);
        expect(isExpired).toBe(false);
    });

    it('#marketInfo', async () => {
        const marketInfo = await market.getMarketInfo();
        const exchangerate = await routerStatic.callStatic.getExchangeRate(market.address);

        expect(marketInfo.pt).toBe(currentConfig.ptAddress);
        expect(marketInfo.scy).toBe(currentConfig.scyAddress);
        // expect(marketInfo.exchangeRate.eq(exchangerate)).toBe(true);
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
        expect(userMarketInfo.ptBalance.token).toBe(currentConfig.ptAddress);
        expect(userMarketInfo.scyBalance.token).toBe(currentConfig.scyAddress);

        // Verify lp balance
        expect(userMarketInfo.lpBalance.eq(userBalance)).toBe(true);
        expect(
            userMarketInfo.ptBalance.amount.eq(userBalance.mul(marketInfo.state.totalPt).div(marketInfo.state.totalLp))
        ).toBe(true);
        expect(
            userMarketInfo.scyBalance.amount.eq(
                userBalance.mul(marketInfo.state.totalScy).div(marketInfo.state.totalLp)
            )
        ).toBe(true);

        // Verify underlying balance
        expect(userMarketInfo.assetBalance.assetType).toBe(scyInfo.assetType);
        expect(userMarketInfo.assetBalance.assetAddress).toBe(scyInfo.assetAddress);
        expect(
            userMarketInfo.assetBalance.amount.eq(
                userMarketInfo.scyBalance.amount.mul(scyExchangeRate).div(decimalFactor(18))
            )
        ).toBe(true);
    });
});
