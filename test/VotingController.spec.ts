import { Market, VotingController } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(VotingController, () => {
    const votingController = new VotingController(currentConfig.votingController!, networkConnection, ACTIVE_CHAIN_ID);
    const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(votingController).toBeInstanceOf(VotingController);
        expect(votingController.address).toBe(currentConfig.votingController);
    });

    it('#vote', async () => {
        await votingController.vote(market, 1);
    });
});
