import { BigNumber } from 'ethers';
import { Market, SCY } from '../src';
import { decimalFactor } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET, print } from './util/testUtils';

describe(Market, () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const sender = WALLET().wallet;
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    it('#constructor', () => {
        expect(market).toBeInstanceOf(Market);
        expect(market.address).toBe(currentConfig.marketAddress);
        expect(market.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#marketInfo', async () => {
        const marketInfo = await market.getMarketInfo();
        expect(marketInfo.pt).toBe(currentConfig.ptAddress);
        expect(marketInfo.scy).toBe(currentConfig.scyAddress);
    });

    it('userMarketInfo', async () => {
        const [marketInfo, userMarketInfo, userBalance, scyInfo, scyExchangeRate] = await Promise.all([
            market.getMarketInfo(),
            market.getUserMarketInfo(sender.address),
            market.contract.callStatic.balanceOf(sender.address),
            scy.contract.assetInfo(),
            scy.contract.exchangeRate(),
        ]);

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

describe.skip('#contract', () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const contract = market.contract.callStatic;

    it('Read Contract', async () => {
        const [totalSupply, tokens, isExpired, rewardTokens, state] = await Promise.all([
            contract.totalSupply(),
            contract.readTokens(),
            contract.isExpired(),
            contract.getRewardTokens(),
            contract.readState(false),
        ]);

        expect(totalSupply.toBigInt()).toBeGreaterThanOrEqual(0);
        expect(tokens._PT).toBe(currentConfig.ptAddress);
        expect(tokens._YT).toBe(currentConfig.ytAddress);
        expect(tokens._SCY).toBe(currentConfig.scyAddress);
        expect(isExpired).toBe(false);
        expect(rewardTokens).toBeDefined();
        expect(state).toBeDefined();
    });

    //  Test all write functions via Router
});
