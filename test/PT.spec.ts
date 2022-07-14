import { type Address, PT } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection,testConfig,WALLET,print } from './testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(PT,() => {
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    
    it('#constructor',async () => {
        expect(pt).toBeInstanceOf(PT);
        expect(pt.address).toBe(currentConfig.ptAddress);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract',async () => {
        const {contract} = pt;
        expect(contract).toBeDefined();
        const supply = await contract.totalSupply();
        expect(supply.toBigInt()).toBeGreaterThan(0);
        
    })

    it('#userInfo',async () => {
        const userInfo = await pt.userInfo(currentConfig.deployer);
        expect(userInfo).toBeDefined();
        
    })

    it('#getInfo',async () => {
        const ptInfo = await pt.getInfo();
        expect(ptInfo).toBeDefined();
    })
})