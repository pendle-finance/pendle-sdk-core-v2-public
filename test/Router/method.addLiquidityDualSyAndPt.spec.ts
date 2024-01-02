import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import { syAddress, ptAddress, marketAddress, signerAddress, chainId, router, sendTxWithInfApproval } from './setup';

describe('#addLiquidityDualSyAndPt', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let syBalanceBefore: pendleSDK.BN;
    let ptBalanceBefore: pendleSDK.BN;
    let lpBalanceBefore: pendleSDK.BN;
    let syAdd: pendleSDK.BN;
    let ptAdd: pendleSDK.BN;

    beforeAll(async () => {
        [syBalanceBefore, ptBalanceBefore, lpBalanceBefore] = await Promise.all([
            tokenHelper.getBalance(syAddress, signerAddress),
            tokenHelper.getBalance(ptAddress, signerAddress),
            tokenHelper.getBalance(marketAddress, signerAddress),
        ]);
        syAdd = pendleSDK.bnMin(testHelper.valueToTokenAmount(syAddress, chainId), syBalanceBefore);
        ptAdd = pendleSDK.bnMin(testHelper.valueToTokenAmount(ptAddress, chainId), ptBalanceBefore);

        if (syAdd.eq(0) || ptAdd.eq(0)) {
            throw new Error('skip test because syAdd or ptAdd is 0');
        }
    });

    let metaMethodPromise: Promise<pendleSDK.MetaMethodForRouterMethod<pendleSDK.Router['addLiquidityDualSyAndPt']>>;
    beforeAll(async () => {
        metaMethodPromise = router.addLiquidityDualSyAndPt(
            testEnv.currentConfig.marketAddress,
            syAdd,
            ptAdd,
            constants.SLIPPAGE_TYPE2,
            {
                method: 'meta-method',
            }
        );
    });

    const mockCalculationFinalizedListener = jest.fn();
    router.events.addListener('calculationFinalized', mockCalculationFinalizedListener);

    it('should have user balance transferred correctly', async () => {
        const readerData = await sendTxWithInfApproval(() => metaMethodPromise, [syAddress, ptAddress]);

        const [lpBalanceAfter, ptBalanceAfter, syBalanceAfter] = await Promise.all([
            tokenHelper.getBalance(marketAddress, signerAddress),
            tokenHelper.getBalance(ptAddress, signerAddress),
            tokenHelper.getBalance(syAddress, signerAddress),
        ]);
        expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(readerData.netLpOut, constants.DEFAULT_EPSILON);
        expect([ptBalanceBefore, ptBalanceAfter]).toHaveDifferenceBN(
            readerData.netPtUsed.mul(-1),
            constants.DEFAULT_EPSILON
        );
        expect([syBalanceBefore, syBalanceAfter]).toHaveDifferenceBN(
            readerData.netSyUsed.mul(-1),
            constants.DEFAULT_EPSILON
        );
    });

    describe('calculationFinalized event', () => {
        it('should be emited ONCE', () => {
            expect(mockCalculationFinalizedListener.mock.calls).toHaveLength(1);
        });

        it('should emit metaMethod', async () => {
            expect(mockCalculationFinalizedListener.mock.calls[0][0].metaMethod).toBe(await metaMethodPromise);
        });
    });
});
