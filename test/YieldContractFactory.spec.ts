import { BigNumber } from 'ethers';
import { type Address, YieldContractFactory } from '../src';
import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

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
