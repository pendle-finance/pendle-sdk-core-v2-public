import { Contract } from 'ethers';
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
        expect(yieldFactory.contract).toBeInstanceOf(Contract);
        expect(yieldFactory.contract.address).toBe(currentConfig.yieldContractFactory);
    });

    it('#contract', async () => {
        const contract = yieldFactory.contract;
        expect(await contract.functions.isPT(currentConfig.ptAddress)).toStrictEqual([true]);
        expect(await contract.functions.isYT(currentConfig.ytAddress)).toStrictEqual([true]);

        expect(await contract.functions.isPT(currentConfig.ytAddress)).toStrictEqual([false]);
        expect(await contract.functions.isYT(currentConfig.ptAddress)).toStrictEqual([false]);
    });
});
