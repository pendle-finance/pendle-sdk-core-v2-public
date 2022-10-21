import { PtEntity } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(PtEntity, () => {
    const pt = new PtEntity(currentConfig.market.PT, ACTIVE_CHAIN_ID, networkConnection);

    it('#constructor', async () => {
        expect(pt).toBeInstanceOf(PtEntity);
        expect(pt.address).toBe(currentConfig.market.PT);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
        // expect(pt.contract).toBeInstanceOf(Contract);
        // expect(pt.ptContract).toBeInstanceOf(Contract);
        expect(pt.contract.address).toBe(currentConfig.market.PT);
    });

    // Refer to test/PY.spec.ts for others tests
});
