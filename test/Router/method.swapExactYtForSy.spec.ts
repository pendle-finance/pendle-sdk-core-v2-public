import * as pendleSDK from '../../src';
import * as swapAmountCalculator from './swapAmountCalculator';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import {
    balanceSnapshotBefore,
    marketAddress,
    ytAddress,
    router,
    chainId,
    sendTxWithInfApproval,
    getSwapBalanceSnapshot,
} from './setup';

describe('Router#swapExactYtForSy', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let ytInAmount: pendleSDK.BN;

    beforeAll(async () => {
        ytInAmount = pendleSDK.bnMin(
            swapAmountCalculator.getYtSwapAmountIn(balanceSnapshotBefore),
            testHelper.valueToTokenAmount(ytAddress, chainId)
        );
        if (ytInAmount.eq(0)) {
            throw new Error('skip test because ytInAmount is 0');
        }
    });

    it('should have user balances transferred correctly', async () => {
        const readerResult = await sendTxWithInfApproval(
            () =>
                router.swapExactYtForSy(marketAddress, ytInAmount, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [ytAddress]
        );

        const balanceSnapshotAfter = await getSwapBalanceSnapshot();
        expect([balanceSnapshotBefore.ytBalance, balanceSnapshotAfter.ytBalance]).toHaveDifferenceBN(
            ytInAmount.mul(-1)
        );

        expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
            readerResult.netSyOut,
            constants.DEFAULT_EPSILON
        );
    });
});
