import { YieldContractFactory } from '../src';
import { currentConfig, networkConnection } from './util/testEnv';

describe(YieldContractFactory, () => {
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;
    const yieldFactory = new YieldContractFactory(currentConfig.yieldContractFactory, networkConnection);

    it('#constructor', async () => {
        expect(yieldFactory).toBeInstanceOf(YieldContractFactory);
        expect(yieldFactory.address).toBe(currentConfig.yieldContractFactory);
        // expect(yieldFactory.contract).toBeInstanceOf(Contract);
        expect(yieldFactory.contract.address).toBe(currentConfig.yieldContractFactory);
    });

    it('#contract', async () => {
        const contract = yieldFactory.contract;
        expect(await contract.functions.isPT(ptAddress)).toStrictEqual([true]);
        expect(await contract.functions.isYT(ytAddress)).toStrictEqual([true]);

        expect(await contract.functions.isPT(ytAddress)).toStrictEqual([false]);
        expect(await contract.functions.isYT(ptAddress)).toStrictEqual([false]);
    });
});
