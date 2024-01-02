import { PtEntity } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnectionWithChainId } from './util/testEnv';

describe(PtEntity, () => {
    const pt = new PtEntity(currentConfig.market.ptAddress, networkConnectionWithChainId);

    it('#constructor', () => {
        expect(pt).toBeInstanceOf(PtEntity);
        expect(pt.address).toBe(currentConfig.market.ptAddress);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
        // expect(pt.contract).toBeInstanceOf(Contract);
        // expect(pt.ptContract).toBeInstanceOf(Contract);
        expect(pt.contract.address).toBe(currentConfig.market.ptAddress);
    });

    // Refer to test/PY.spec.ts for others tests
});
