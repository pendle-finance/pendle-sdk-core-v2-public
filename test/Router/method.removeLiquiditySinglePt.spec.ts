import * as pendleSDK from '../../src';
import * as testHelper from '../util/testHelper';
import * as tokenHelper from '../util/tokenHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import { router, signerAddress, chainId, sendTxWithInfApproval } from './setup';

describe('Router#removeLiquiditySinglePt', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    sharedTestRemoveLiquidityForMarket(() => testEnv.currentConfig.market);
});

function sharedTestRemoveLiquidityForMarket(
    getMarketDataToTest: () => {
        marketAddress: pendleSDK.Address;
        ptAddress: pendleSDK.Address;
    }
) {
    let liquidityRemove: pendleSDK.BN;
    let lpBalanceBefore: pendleSDK.BN;
    let ptBalanceBefore: pendleSDK.BN;
    let marketAddress: pendleSDK.Address;
    let ptAddress: pendleSDK.Address;

    beforeAll(() => {
        ({ marketAddress, ptAddress } = getMarketDataToTest());
    });

    beforeAll(async () => {
        const amountToTest = testHelper.valueToTokenAmount(marketAddress, chainId);
        lpBalanceBefore = amountToTest.mul(2);
        await testHelper.setPendleERC20Balance(marketAddress, signerAddress, lpBalanceBefore);
        ptBalanceBefore = await tokenHelper.getBalance(ptAddress, signerAddress);

        liquidityRemove = amountToTest;
    });

    it('should have user balance transferred correctly', async () => {
        const readerData = await sendTxWithInfApproval(
            () =>
                router.removeLiquiditySinglePt(marketAddress, liquidityRemove, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [marketAddress]
        );

        const [lpBalanceAfter, ptBalanceAfter] = await Promise.all([
            tokenHelper.getBalance(marketAddress, signerAddress),
            tokenHelper.getBalance(ptAddress, signerAddress),
        ]);

        expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(liquidityRemove.mul(-1));
        expect([ptBalanceBefore, ptBalanceAfter]).toHaveDifferenceBN(readerData.netPtOut, constants.DEFAULT_EPSILON);
    });
}
