import { MarketFactory } from '../src';
import { currentConfig, networkConnection } from './util/testEnv';

describe('MarketFactory', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection);
    const contract = marketFactory.contract;

    it('#constructor', () => {
        expect(marketFactory).toBeInstanceOf(MarketFactory);
        expect(marketFactory.address).toBe(currentConfig.marketFactory);
        // expect(marketFactory.contract).toBeInstanceOf(Contract);
        expect(contract.address).toBe(currentConfig.marketFactory);
    });

    it('#contract', async () => {
        const treasure = await contract.treasury();
        expect(treasure).toBeDefined();
        const valid = await contract.isValidMarket(currentConfig.marketAddress);
        expect(valid).toBe(true);
    });
});
