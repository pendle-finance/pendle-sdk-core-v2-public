import { type Address, Market, MarketFactory } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe('MarketFactory', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection, ACTIVE_CHAIN_ID);
    it('#constructor', async () => {
        expect(marketFactory).toBeInstanceOf(MarketFactory);
        expect(marketFactory.address).toBe(currentConfig.marketFactory);
        expect(marketFactory.chainId).toBe(ACTIVE_CHAIN_ID);
    });
});

describe('contract', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection, ACTIVE_CHAIN_ID);
    const { contract } = marketFactory;

    it('Read contract', async () => {
        const treasure = await contract.treasury();
        expect(treasure).toBeDefined();
    });
});
