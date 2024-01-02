import * as pendleSDK from '../../src';
import * as testEnv from '../util/testEnv';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';

import { router, marketEntity, marketAddress, ytAddress, syAddress, signerAddress, chainId } from './setup';

describe('Router#bundler', () => {
    describe('call mintPyFromSy then redeem market reward', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        const rewardTokens = testEnv.currentConfig.market.rewardTokens.map(({ address }) => address);

        let rewardBalancesBefore: pendleSDK.BN[];
        let syBalanceBefore: pendleSDK.BN;
        let mintSyAmount: pendleSDK.BN;

        beforeAll(async () => {
            [rewardBalancesBefore, syBalanceBefore] = await Promise.all([
                tokenHelper.getUserBalances(signerAddress, rewardTokens),
                tokenHelper.getBalance(syAddress, signerAddress),
            ]);
            mintSyAmount = pendleSDK.bnMin(testHelper.valueToTokenAmount(syAddress, chainId), syBalanceBefore);

            await tokenHelper.approveInf(syAddress, router.address);
            await marketEntity.transfer(pendleSDK.NATIVE_ADDRESS_0xEE, '0');
        });

        const bundler = router.createTransactionBundler();
        let bundledMetaMethod: Awaited<pendleSDK.RouterMetaMethodReturnType<'meta-method', 'multicall'>>;
        beforeAll(async () => {
            bundler
                .addContractMetaMethod(
                    await router.mintPyFromSy(ytAddress, mintSyAmount, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    })
                )
                .addContractMetaMethod(
                    await router.redeemDueInterestAndRewards({ markets: [marketAddress] }, { method: 'meta-method' })
                );
            bundledMetaMethod = await bundler.execute({ method: 'meta-method' });
        });

        describe('callStatic check', () => {
            it('should have all calls susscesfully executed', async () => {
                const callStaticData = await bundledMetaMethod.callStatic();
                for (const { success } of callStaticData) {
                    expect(success).toBeTruthy();
                }
            });

            it.todo('should have correct data when callStatic');
        });

        describe('tx sent check', () => {
            beforeAll(async () => {
                await bundledMetaMethod.send();
            });

            it('should have sy balance transferred correctly', async () => {
                const syBalanceAfter = await tokenHelper.getBalance(syAddress, signerAddress);
                expect(syBalanceAfter).toEqBN(syBalanceBefore.sub(mintSyAmount));
            });

            it('should have some reward', async () => {
                const rewardBalancesAfter = await tokenHelper.getUserBalances(signerAddress, rewardTokens);
                expect(rewardBalancesAfter.some((balance, i) => balance.gt(rewardBalancesBefore[i]))).toBeTruthy();
            });
        });
    });
});
