import { MarketFactory } from '../src';
import { currentConfig, networkConnection } from './util/testUtils';

describe('MarketFactory', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection);

    it('#constructor', async () => {
        expect(marketFactory).toBeInstanceOf(MarketFactory);
        expect(marketFactory.address).toBe(currentConfig.marketFactory);
    });
});

describe('#contract', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection);
    const { contract } = marketFactory;

    it('Read contract', async () => {
        const treasure = await contract.treasury();
        expect(treasure).toBeDefined();
    });
});
