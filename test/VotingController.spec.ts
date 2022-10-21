import { MarketEntity, VotingController } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, describeWrite, networkConnection } from './util/testUtils';

describe(VotingController, () => {
    const votingController = new VotingController(currentConfig.votingController!, ACTIVE_CHAIN_ID, networkConnection);
    const market = new MarketEntity(currentConfig.marketAddress, ACTIVE_CHAIN_ID, networkConnection);

    it('#constructor', async () => {
        expect(votingController).toBeInstanceOf(VotingController);
        expect(votingController.address).toBe(currentConfig.votingController);
    });

    describeWrite(() => {
        it.skip('#vote', async () => {
            // TODO: Check if pool is active before voting
            await votingController.vote([{ market, weight: 1 }]);
        });
    });
});
