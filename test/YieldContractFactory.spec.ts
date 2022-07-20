import { YieldContractFactory } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(YieldContractFactory, () => {
    const yieldFactory = new YieldContractFactory(
        currentConfig.yieldContractFactory,
        networkConnection,
        ACTIVE_CHAIN_ID
    );

    it('#constructor', async () => {
        expect(yieldFactory).toBeInstanceOf(YieldContractFactory);
        expect(yieldFactory.address).toBe(currentConfig.yieldContractFactory);
        expect(yieldFactory.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract', async () => {
        const { contract } = yieldFactory;
        expect(contract).toBeDefined();
    });
});
