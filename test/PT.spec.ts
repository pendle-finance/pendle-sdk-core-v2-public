import { PT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(PT, () => {
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(pt).toBeInstanceOf(PT);
        expect(pt.address).toBe(currentConfig.ptAddress);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract', async () => {
        const { contract } = pt;
        expect(contract).toBeDefined();
        const supply = await contract.totalSupply();
        expect(supply.toBigInt()).toBeGreaterThanOrEqual(0);
    });

    it('#userInfo', async () => {
        const userInfo = await pt.userInfo(currentConfig.deployer);
        expect(userInfo).toBeDefined();
    });

    it('#getInfo', async () => {
        const ptInfo = await pt.getInfo();
        expect(ptInfo).toBeDefined();
    });
});
