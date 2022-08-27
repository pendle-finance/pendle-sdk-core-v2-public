import { Contract } from 'ethers';
import { ERC20, YT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(YT, () => {
    const yt = new YT(currentConfig.market.YT, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(yt).toBeInstanceOf(YT);
        expect(yt.address).toBe(currentConfig.market.YT);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(yt.contract).toBeInstanceOf(Contract);
        expect(yt.contract.address).toBe(currentConfig.market.YT);
        expect(yt.ERC20).toBeInstanceOf(ERC20);
    });

    // Refer to test/PY.spec.ts for others tests
});
