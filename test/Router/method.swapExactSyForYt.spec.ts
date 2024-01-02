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
} from './setup';

describe('Router#swapExactSyForYt', () => {
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
                router.swapExactSyForYt(marketAddress, syInAmount, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [syAddress]
        );

        const balanceSnapshotAfter = await getSwapBalanceSnapshot();
        expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
            syInAmount.mul(-1)
        );

        expect([balanceSnapshotBefore.ytBalance, balanceSnapshotAfter.ytBalance]).toHaveDifferenceBN(
            readerResult.netYtOut,
            constants.DEFAULT_EPSILON
        );
    });
});
