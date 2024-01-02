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
} from './setup';

describe('Router#swapExactPtForYt', () => {
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
                router.swapExactPtForYt(marketAddress, ptInAmount, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [ptAddress]
        );

        const balanceSnapshotAfter = await getSwapBalanceSnapshot();
        expect([balanceSnapshotBefore.ptBalance, balanceSnapshotAfter.ptBalance]).toHaveDifferenceBN(
            ptInAmount.mul(-1)
        );

        expect([balanceSnapshotBefore.ytBalance, balanceSnapshotAfter.ytBalance]).toHaveDifferenceBN(
            readerResult.netYtOut,
            constants.DEFAULT_EPSILON
        );
    });
});
