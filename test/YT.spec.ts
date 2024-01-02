import { YtEntity } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnectionWithChainId } from './util/testEnv';

describe(YtEntity, () => {
    const yt = new YtEntity(currentConfig.market.ytAddress, networkConnectionWithChainId);

    it('#constructor', () => {
        expect(yt).toBeInstanceOf(YtEntity);
        expect(yt.address).toBe(currentConfig.market.ytAddress);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
        // expect(yt.contract).toBeInstanceOf(Contract);
        expect(yt.contract.address).toBe(currentConfig.market.ytAddress);
    });

    // Refer to test/PY.spec.ts for others tests
});
