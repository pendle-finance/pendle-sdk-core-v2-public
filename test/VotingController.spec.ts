import BigNumber from 'bignumber.js';
import { MarketEntity, VotingController, isMainchain } from '../src';
import { ONE_E18_BN } from './util/constants';
import {
    ACTIVE_CHAIN_ID,
    BLOCK_CONFIRMATION,
    currentConfig,
    networkConnection,
    networkConnectionWithChainId,
} from './util/testEnv';
import * as testHelper from './util/testHelper';

testHelper.describeIf(isMainchain(ACTIVE_CHAIN_ID))('VotingController', () => {
    const votingController = new VotingController(currentConfig.votingController, networkConnection);
    const market = new MarketEntity(currentConfig.marketAddress, networkConnectionWithChainId);
    const signerAddress = networkConnection.signer.address;

    it('#constructor', () => {
        expect(votingController).toBeInstanceOf(VotingController);
        expect(votingController.address).toBe(currentConfig.votingController);
    });

    describe('Write function', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        it('#vote', async () => {
            const address = market.address;
            const isActive = await votingController.contract.callStatic
                .getPoolData(address, [])
                .then((res) => !res.chainId.isZero());
            if (!isActive) {
                throw new Error(`Market ${address} is not active`);
            }
            const totalVotedBefore = await votingController.contract.callStatic
                .getUserData(signerAddress, [])
                .then((res) => res.totalVotedWeight);
            const amountToVote = ONE_E18_BN.sub(totalVotedBefore);

            await votingController
                .vote([
                    { market, weight: new BigNumber(amountToVote.toString()).div(ONE_E18_BN.toString()).toNumber() },
                ])
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const totalVotedAfter = await votingController.contract.callStatic
                .getUserData(signerAddress, [])
                .then((res) => res.totalVotedWeight);
            expect(totalVotedAfter).toEqBN(ONE_E18_BN);
        });
    });
});
