import * as pendleSDK from '../../src';
import * as constants from '../util/constants';
import * as testHelper from '../util/testHelper';
import * as testEnv from '../util/testEnv';

import { router, balanceSnapshotBefore, getSwapBalanceSnapshot, chainId, sendTxWithInfApproval } from './setup';

describe('Router#removeLiquidityDualSyAndPt', () => {
    sharedTests();

    describe('with expired market', () => {
        const DAY_ms = 24 * 60 * 60 * 1000;
        describe('after expiry', () => {
            testHelper.useSetTime(new Date(testEnv.currentConfig.market.expiry_ms + DAY_ms));
            sharedTests();
        });
    });
});

function sharedTests() {
    testHelper.useRestoreEvmSnapShotAfterEach();
    let liquidityRemove: pendleSDK.BN;

    beforeAll(async () => {
        liquidityRemove = pendleSDK.bnMin(
            balanceSnapshotBefore.lpBalance,
            testHelper.valueToTokenAmount(testEnv.currentConfig.market.marketAddress, chainId)
        );

        if (liquidityRemove.eq(0)) {
            throw new Error('skip test because liquidityRemove is 0');
        }
    });

    it('should have user balance transferred correctly', async () => {
        const metaMethod = await router.removeLiquidityDualSyAndPt(
            testEnv.currentConfig.market.marketAddress,
            liquidityRemove,
            constants.SLIPPAGE_TYPE2,
            {
                method: 'meta-method',
            }
        );

        const readerResult = await sendTxWithInfApproval(
            () => metaMethod,
            [testEnv.currentConfig.market.marketAddress]
        );
        const balanceSnapshotAfter = await getSwapBalanceSnapshot();

        expect([balanceSnapshotBefore.lpBalance, balanceSnapshotAfter.lpBalance]).toHaveDifferenceBN(
            liquidityRemove.mul(-1)
        );

        expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
            readerResult.netSyOut,
            constants.DEFAULT_EPSILON
        );
        expect([balanceSnapshotBefore.ptBalance, balanceSnapshotAfter.ptBalance]).toHaveDifferenceBN(
            readerResult.netPtOut,
            constants.DEFAULT_EPSILON
        );
    });
}
