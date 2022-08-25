import { Contract } from 'ethers';
import { MarketFactory } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe('MarketFactory', () => {
    const marketFactory = new MarketFactory(currentConfig.marketFactory, networkConnection, ACTIVE_CHAIN_ID);
    const contract = marketFactory.contract;

    it('#constructor', async () => {
        expect(marketFactory).toBeInstanceOf(MarketFactory);
        expect(marketFactory.address).toBe(currentConfig.marketFactory);
        expect(marketFactory.contract).toBeInstanceOf(Contract);
        expect(marketFactory.contract.address).toBe(currentConfig.marketFactory);
    });

    it('#contract', async () => {
        const treasure = await contract.treasury();
        expect(treasure).toBeDefined();
        const valid = await marketFactory.contract.isValidMarket(currentConfig.marketAddress);
        expect(valid).toBe(true);
    });
});
