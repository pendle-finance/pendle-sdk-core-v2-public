import { MarketFactory } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe('MarketFactory', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(marketFactory).toBeInstanceOf(MarketFactory);
        expect(marketFactory.address).toBe(currentConfig.marketFactory);
    });
});

describe('#contract', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection, ACTIVE_CHAIN_ID);
    const { contract } = marketFactory;

    it('Read contract', async () => {
        const treasure = await contract.treasury();
        expect(treasure).toBeDefined();
        const valid = await marketFactory.contract.isValidMarket(currentConfig.marketAddress);
        console.log(valid);
    });
});
