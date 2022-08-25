import { Market, VotingController } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, describeWrite, networkConnection } from './util/testUtils';

describe(VotingController, () => {
    const votingController = new VotingController(currentConfig.votingController!, networkConnection, ACTIVE_CHAIN_ID);
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);

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
