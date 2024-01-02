import * as pendleSDK from '../../src';
import * as testHelper from '../util/testHelper';
import * as tokenHelper from '../util/tokenHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import { router, signerAddress, chainId, sendTxWithInfApproval } from './setup';

describe('Router#removeLiquiditySingleSy', () => {
    sharedTestRemoveLiquiditySingleSyForMarket(() => testEnv.currentConfig.market);

    describe('with expired market', () => {
        const DAY_ms = 24 * 60 * 60 * 1000;
        describe('after expiry', () => {
            testHelper.useSetTime(new Date(testEnv.currentConfig.market.expiry_ms + DAY_ms));
            sharedTestRemoveLiquiditySingleSyForMarket(() => testEnv.currentConfig.market);
        });
    });
});

function sharedTestRemoveLiquiditySingleSyForMarket(
    getMarketDataToTest: () => {
        marketAddress: pendleSDK.Address;
        syAddress: pendleSDK.Address;
    }
) {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let liquidityRemove: pendleSDK.BN;
    let lpBalanceBefore: pendleSDK.BN;
    let syBalanceBefore: pendleSDK.BN;
    let marketAddress: pendleSDK.Address;
    let syAddress: pendleSDK.Address;

    beforeAll(() => {
        ({ marketAddress, syAddress } = getMarketDataToTest());
    });

    beforeAll(async () => {
        const amountToTest = testHelper.valueToTokenAmount(marketAddress, chainId);
        lpBalanceBefore = amountToTest.mul(2);
        await testHelper.setPendleERC20Balance(marketAddress, signerAddress, lpBalanceBefore);
        syBalanceBefore = await tokenHelper.getBalance(syAddress, signerAddress);

        liquidityRemove = amountToTest;
    });

    it('should have user balance transferred correctly', async () => {
        const readerData = await sendTxWithInfApproval(
            () =>
                router.removeLiquiditySingleSy(marketAddress, liquidityRemove, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [marketAddress]
        );

        const [lpBalanceAfter, syBalanceAfter] = await Promise.all([
            tokenHelper.getBalance(marketAddress, signerAddress),
            tokenHelper.getBalance(syAddress, signerAddress),
        ]);

        expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(liquidityRemove.mul(-1));
        expect([syBalanceBefore, syBalanceAfter]).toHaveDifferenceBN(readerData.netSyOut, constants.DEFAULT_EPSILON);
    });
}
