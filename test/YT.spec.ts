import { Contract } from 'ethers';
import { YtEntity } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(YtEntity, () => {
    const yt = new YtEntity(currentConfig.market.YT, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(yt).toBeInstanceOf(YtEntity);
        expect(yt.address).toBe(currentConfig.market.YT);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(yt.contract).toBeInstanceOf(Contract);
        expect(yt.ytContract).toBeInstanceOf(Contract);
        expect(yt.contract.address).toBe(currentConfig.market.YT);
    });

    // Refer to test/PY.spec.ts for others tests
});
