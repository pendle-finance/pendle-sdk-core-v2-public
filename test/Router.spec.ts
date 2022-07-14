import { BigNumber } from 'ethers';
import { type Address, Router } from '../src';
import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(Router, () => {
    const pendleRouting = new Router(currentConfig.router, networkConnection, ACTIVE_CHAIN_ID);
    it('#constructor', async () => {
        expect(pendleRouting).toBeInstanceOf(Router);
        expect(pendleRouting.address).toBe(currentConfig.router);
        expect(pendleRouting.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract', () => {
        const { contract } = pendleRouting;
        expect(contract).toBeDefined();
    });
});
