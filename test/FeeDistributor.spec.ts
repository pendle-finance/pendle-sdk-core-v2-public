import { getContractAddresses } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, networkConnectionWithChainId, BLOCK_CONFIRMATION } from './util/testEnv';
import * as testHelper from './util/testHelper';
import { FeeDistributor } from '../src/entities/FeeDistributor';

// Test is disable. Use FeeDistributorV2 instead
// testHelper.describeIf(isMainchain(ACTIVE_CHAIN_ID))('FeeDistributor', () => {
describe.skip('FeeDistributor', () => {
    let feeDistributor: FeeDistributor;
    beforeAll(() => {
        feeDistributor = FeeDistributor.getFeeDistributor(networkConnectionWithChainId);
    });

    it('#constructor', () => {
        expect(feeDistributor).toBeInstanceOf(FeeDistributor);
    });

    it('#getContract', () => {
        const contract = feeDistributor.contract;
        expect(contract.address).toBe(getContractAddresses(ACTIVE_CHAIN_ID).FEE_DISTRIBUTOR);
    });

    describe('write functions', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        const user = networkConnection.signerAddress;
        it('#claimReward', async () => {
            const pools = await feeDistributor.getAllPools();
            const metaCall = await feeDistributor.claimReward(user, pools, {
                method: 'meta-method',
                filterEmptyRewardPools: true,
            });

            expect(metaCall.data.poolRewards.map((poolReward) => poolReward.pool)).toEqual(pools);

            await metaCall
                .connect(networkConnection.signer)
                .send()
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        });
    });
});
