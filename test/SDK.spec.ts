import { SDK } from '../src/entities/SDK';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(SDK, () => {
    const sdk = new SDK(networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(sdk).toBeInstanceOf(SDK);
        expect(sdk.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#userPositionPY', async () => {
        const userPositionPY = await sdk.getUserPYPositionsByPYs(currentConfig.deployer, [
            currentConfig.ytAddress,
            currentConfig.ptAddress,
        ]);
        expect(userPositionPY).toBeDefined();
    });

    it('#userPositionMarket', async () => {
        const userPositionMarket = await sdk.getUserMarketPositions(currentConfig.deployer, [
            currentConfig.marketAddress,
        ]);
        expect(userPositionMarket).toBeDefined();
    });
});
