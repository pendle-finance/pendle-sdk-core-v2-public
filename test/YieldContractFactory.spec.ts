import { YieldContractFactory } from '../src';
import { currentConfig, networkConnection } from './util/testUtils';

describe(YieldContractFactory, () => {
    const yieldFactory = new YieldContractFactory(currentConfig.yieldContractFactory, networkConnection);

    it('#constructor', async () => {
        expect(yieldFactory).toBeInstanceOf(YieldContractFactory);
        expect(yieldFactory.address).toBe(currentConfig.yieldContractFactory);
    });

    it('#contract', async () => {
        const { contract } = yieldFactory;
        expect(contract).toBeDefined();
    });
});
