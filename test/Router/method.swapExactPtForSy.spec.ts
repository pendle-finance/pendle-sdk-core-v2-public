import * as pendleSDK from '../../src';
import * as swapAmountCalculator from './swapAmountCalculator';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import {
    balanceSnapshotBefore,
    marketAddress,
    ptAddress,
    router,
    chainId,
    sendTxWithInfApproval,
    getSwapBalanceSnapshot,
    verifyPtSyBalanceChanges,
} from './setup';

describe('Router#swapExactPtForSy', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let ptInAmount: pendleSDK.BN;

    beforeAll(async () => {
        ptInAmount = pendleSDK.bnMin(
            swapAmountCalculator.getPtSwapAmountIn(balanceSnapshotBefore),
            testHelper.valueToTokenAmount(ptAddress, chainId)
        );
        if (ptInAmount.eq(0)) {
            throw new Error('skip test because ptInAmount is 0');
        }
    });

    it('should have user balances transferred correctly', async () => {
        const readerResult = await sendTxWithInfApproval(
            () =>
                router.swapExactPtForSy(marketAddress, ptInAmount, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [ptAddress]
        );

        const balanceSnapshotAfter = await getSwapBalanceSnapshot();
        verifyPtSyBalanceChanges(balanceSnapshotBefore, balanceSnapshotAfter);
        expect([balanceSnapshotBefore.marketPtBalance, balanceSnapshotAfter.marketPtBalance]).toHaveDifferenceBN(
            ptInAmount
        );

        expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
            readerResult.netSyOut,
            constants.DEFAULT_EPSILON
        );
    });
});
