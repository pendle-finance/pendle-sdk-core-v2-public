import { Market } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';

describe(Market, () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const sender = WALLET().wallet;

    it('#constructor', () => {
        expect(market).toBeInstanceOf(Market);
        expect(market.address).toBe(currentConfig.marketAddress);
        expect(market.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#marketInfo', async () => {
        const marketInfo = await market.getMarketInfo();
        console.log(marketInfo.state.totalPt);
        expect(marketInfo.pt).toBe(currentConfig.ptAddress);
        expect(marketInfo.scy).toBe(currentConfig.scyAddress);
    });

    it('userMarketInfo', async () => {
        const userMarketInfo = await market.getUserMarketInfo(sender.address);
        expect(userMarketInfo).toBeDefined();
    });
});

describe('#contract', () => {
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
