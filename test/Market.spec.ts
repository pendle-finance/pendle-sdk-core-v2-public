import { BigNumber } from 'ethers';
import { Market } from '../src';
//  import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, WALLET, print } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

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
        expect(marketInfo.pt).toBe(currentConfig.ptAddress);
        expect(marketInfo.scy).toBe(currentConfig.scyAddress);
    });

    it('userMarketInfo', async () => {
        const userMarketInfo = await market.getUserMarketInfo(sender.address);
        expect(userMarketInfo).toBeDefined();
    });
});

describe('contract', () => {
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const sender = WALLET().wallet;
    const { contract } = market;

    it('Read Contract', async () => {
        const totalSupply = (await contract.totalSupply()).toBigInt();
        expect(totalSupply).toBe(BigNumber.from(0).toBigInt());

        const Token = await contract.readTokens();
        expect(Token._PT).toBe(currentConfig.ptAddress);
        expect(Token._YT).toBe(currentConfig.ytAddress);
        expect(Token._SCY).toBe(currentConfig.scyAddress);

        const isExperied = await contract.isExpired();
        expect(isExperied).toBe(false);

        const RewardToken = await contract.getRewardTokens();
        expect(RewardToken).toBeDefined();

        const State = await contract.readState(false);
        expect(State).toBeDefined();
    });

    //  All write function test via Router
});
