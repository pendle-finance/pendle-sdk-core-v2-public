import * as pendleSDK from '../../src';
import * as swapAmountCalculator from './swapAmountCalculator';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import {
    balanceSnapshotBefore,
    marketAddress,
    syAddress,
    router,
    chainId,
    sendTxWithInfApproval,
    getSwapBalanceSnapshot,
    verifyPtSyBalanceChanges,
} from './setup';

describe('Router#swapExactSyForPt', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let syInAmount: pendleSDK.BN;

    beforeAll(async () => {
        syInAmount = pendleSDK.bnMin(
            swapAmountCalculator.getSySwapAmountIn(balanceSnapshotBefore),
            testHelper.valueToTokenAmount(syAddress, chainId)
        );
        if (syInAmount.eq(0)) {
            throw new Error('skip test because syInAmount is 0');
        }
    });

    it('should have user balances transferred correctly', async () => {
        const readerResult = await sendTxWithInfApproval(
            () =>
                router.swapExactSyForPt(marketAddress, syInAmount, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [syAddress]
        );

        const balanceSnapshotAfter = await getSwapBalanceSnapshot();
        verifyPtSyBalanceChanges(balanceSnapshotBefore, balanceSnapshotAfter);
        expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
            syInAmount.mul(-1)
        );

        expect([balanceSnapshotBefore.ptBalance, balanceSnapshotAfter.ptBalance]).toHaveDifferenceBN(
            readerResult.netPtOut,
            constants.DEFAULT_EPSILON
        );
    });
});
