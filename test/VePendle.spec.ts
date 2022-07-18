import { BigNumber } from 'ethers';
import { type Address, VePendle } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print } from './util/testUtils';
const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(VePendle, () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    it('#constructor', () => {
        expect(ve).toBeInstanceOf(VePendle);
        expect(ve.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = ve.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });
});

describe('contract', () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const contract = ve.contract;
    it('read contract', async () => {
        // contract
    });
});
