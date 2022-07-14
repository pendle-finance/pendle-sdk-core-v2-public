import { BigNumber } from 'ethers';
import {type Address, PendleRoutingSystem} from '../src';
import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection ,testConfig,print, WALLET} from './testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(PendleRoutingSystem, () => {
    const pendleRouting = new PendleRoutingSystem(currentConfig.router,networkConnection,ACTIVE_CHAIN_ID);
    it('#constructor', async () => {
        expect(pendleRouting).toBeInstanceOf(PendleRoutingSystem);
        expect(pendleRouting.address).toBe(currentConfig.router);
        expect(pendleRouting.chainId).toBe(ACTIVE_CHAIN_ID);
    })

    it('#contract', () => {
        const {contract} = pendleRouting;
        expect(contract).toBeDefined();
    })



})