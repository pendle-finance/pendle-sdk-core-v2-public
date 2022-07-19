import { PendleVotingControllerUpg } from '@pendle/core-v2/typechain-types';
import { BigNumber } from 'ethers';
import { type Address, VotingController, Market } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';
const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(VotingController, () => {
    const votingController = new VotingController(currentConfig.votingController!,networkConnection,ACTIVE_CHAIN_ID);
    const market = new Market(currentConfig.marketAddress,networkConnection,ACTIVE_CHAIN_ID);
    it('#constructor', async () =>{
        expect(votingController).toBeInstanceOf(VotingController);
        expect(votingController.address).toBe(currentConfig.votingController);
    })

    it('#vote', async ()=>{
        await votingController.vote(market,1);
    })
});
