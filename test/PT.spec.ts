import { Contract } from 'ethers';
import { ERC20, PT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(PT, () => {
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(pt).toBeInstanceOf(PT);
        expect(pt.address).toBe(currentConfig.ptAddress);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(pt.contract).toBeInstanceOf(Contract);
        expect(pt.contract.address).toBe(currentConfig.ptAddress);
        expect(pt.ERC20).toBeInstanceOf(ERC20);
    });

    // Refer to test/PY.spec.ts for others tests
});
