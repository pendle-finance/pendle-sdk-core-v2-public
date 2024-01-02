import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as ethers from 'ethers';

import { ptAddress, marketAddress, signerAddress, chainId, router, sendTxWithInfApproval } from './setup';
import * as loSetup from './limitOrderSetup';

describe('Router#addLiquiditySinglePt', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let lpBalanceBefore: pendleSDK.BN;
    let ptBalanceBefore: pendleSDK.BN;
    let ptAdd: pendleSDK.BN;

    beforeAll(async () => {
        [ptBalanceBefore, lpBalanceBefore] = await Promise.all([
            tokenHelper.getBalance(ptAddress, signerAddress),
            tokenHelper.getBalance(marketAddress, signerAddress),
        ]);
        ptAdd = pendleSDK.bnMin(testHelper.valueToTokenAmount(ptAddress, chainId), ptBalanceBefore);
        if (ptAdd.eq(0)) {
            throw new Error('skip test because ptAdd is 0');
        }
    });

    it('should have user balance transferred correctly', async () => {
        const readerData = await sendTxWithInfApproval(
            () =>
                router.addLiquiditySinglePt(marketAddress, ptAdd, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [ptAddress]
        );

        const [lpBalanceAfter, ptBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
            marketAddress,
            ptAddress,
        ]);

        expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(readerData.netLpOut, constants.DEFAULT_EPSILON);
        expect([ptBalanceBefore, ptBalanceAfter]).toHaveDifferenceBN(ptAdd.mul(-1));
    });

    describe('limit order', () => {
        let withoutLimitResult: pendleSDK.MetaMethodForRouterMethod<pendleSDK.BaseRouter['addLiquiditySinglePt']>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let withLimitResult: pendleSDK.MetaMethodForRouterMethod<pendleSDK.BaseRouter['addLiquiditySinglePt']>;

        let ptToPlaceOrder: pendleSDK.BN;
        let order: pendleSDK.limitOrder.FillOrderParamsStruct;

        const loHelper = loSetup.createLimitOrderTestHelper();

        beforeAll(async () => {
            await tokenHelper.approve(ptAddress, router.address, ptAdd);
            withoutLimitResult = await router.addLiquiditySinglePt(marketAddress, ptAdd, constants.SLIPPAGE_TYPE2, {
                method: 'meta-method',
            });

            const ptSwap = withoutLimitResult.data.netPtToSwap;
            // TODO make this number configurable
            ptToPlaceOrder = ptSwap.div(2);

            const marketImpliedRate = withoutLimitResult.data.marketStaticMathBefore.marketState.impliedYield;
            const orderImpliedRate = marketImpliedRate.add(offchainMath.FixedX18.divDown(5n, 100n));
            order = await loHelper.makeOrder({
                orderType: pendleSDK.limitOrder.OrderType.TOKEN_FOR_PT,
                lnImpliedRate: orderImpliedRate.ln(),
                makingAmount: ptToPlaceOrder,
                prefillBalance: true,
            });

            await tokenHelper.approve(order.order.token, loHelper.limitRouter.address, order.makingAmount, {
                signer: loHelper.orderMaker,
            });
            const simulatedNormalFillResult = await loHelper.limitRouter.fill(
                [order],
                pendleSDK.NATIVE_ADDRESS_0x00,
                ethers.constants.MaxUint256,
                { method: 'callStatic' }
            );

            jest.clearAllMocks();
            loSetup.mockLimitOrderMatcher.swapPtForSy.mockImplementationOnce(async () =>
                pendleSDK.limitOrder.LimitOrderMatchedResult.create({
                    normalFills: [order],
                    flashFills: [],
                    netOutputToTaker: simulatedNormalFillResult.actualMaking,
                    netInputFromTaker: simulatedNormalFillResult.actualTaking,
                    totalFee: simulatedNormalFillResult.totalFee,
                })
            );

            withLimitResult = await router.addLiquiditySinglePt(marketAddress, ptAdd, constants.SLIPPAGE_TYPE2, {
                method: 'meta-method',
            });
        });

        it('should call the correct funciton ONCE', () => {
            expect(loSetup.mockLimitOrderMatcher.swapPtForSy.mock.calls).toHaveLength(1);

            expect(loSetup.mockLimitOrderMatcher.swapSyForPt.mock.calls).toHaveLength(0);
            expect(loSetup.mockLimitOrderMatcher.swapYtForSy.mock.calls).toHaveLength(0);
            expect(loSetup.mockLimitOrderMatcher.swapSyForPt.mock.calls).toHaveLength(0);
            expect(loSetup.mockLimitOrderMatcher.swapTokenForPt.mock.calls).toHaveLength(0);
            expect(loSetup.mockLimitOrderMatcher.swapTokenForYt.mock.calls).toHaveLength(0);
        });
        it.todo('should be called WITH buffer');

        describe('tx send', () => {
            testHelper.useRestoreEvmSnapShotAfterEach();

            it.todo('should have user balances tranffered correctly');
        });
    });
});
