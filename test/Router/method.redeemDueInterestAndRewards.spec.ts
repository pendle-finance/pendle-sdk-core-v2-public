import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as testEnv from '../util/testEnv';

import { marketEntity, signerAddress, router } from './setup';

describe('Router#redeemDueInterestAndRewards', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    it('should return to user some interest or rewards', async () => {
        const rewardTokens = testEnv.currentConfig.market.rewardTokens.map(({ address }) => address);
        const balancesBefore = await tokenHelper.getUserBalances(signerAddress, rewardTokens);

        // because we set our LP balance by editing storage slot, we need to trigger a
        // transfer so that the contract will calculate the rewards correctly
        await marketEntity.transfer(pendleSDK.NATIVE_ADDRESS_0xEE, '0');

        await router.redeemDueInterestAndRewards({
            markets: [testEnv.currentConfig.marketAddress],
        });

        const balancesAfter = await tokenHelper.getUserBalances(signerAddress, rewardTokens);
        expect(balancesAfter.some((balance, i) => balance.gt(balancesBefore[i]))).toBeTruthy();
    });
});
