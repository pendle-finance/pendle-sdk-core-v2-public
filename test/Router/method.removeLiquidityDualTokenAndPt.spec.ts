import * as pendleSDK from '../../src';
import * as testHelper from '../util/testHelper';
import * as testEnv from '../util/testEnv';
import * as constants from '../util/constants';
import * as tokenHelper from '../util/tokenHelper';
import {
    router,
    chainId,
    marketAddress,
    ptAddress,
    signerAddress,
    tokensOutToTest,
    balanceSnapshotBefore,
    sendTxWithInfApproval,
} from './setup';

describe('Router#removeLiquidityDualTokenAndPt', () => {
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
    const tokensToTest = [
        { name: 'native  token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
        ...tokensOutToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ];

    const tokenBalancesBefore: Partial<Record<pendleSDK.Address, pendleSDK.BN>> = {};
    beforeAll(async () => {
        await Promise.all(
            tokensToTest.map(async ({ address }) => {
                const tokenBalance = await tokenHelper.getBalance(address, signerAddress);
                tokenBalancesBefore[address] = tokenBalance;
            })
        );
    });

    describe.each(tokensToTest)('With $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        let liquidityRemove: pendleSDK.BN;
        let tokenBalanceBefore: pendleSDK.BN;
        beforeAll(async () => {
            liquidityRemove = pendleSDK.bnMin(
                balanceSnapshotBefore.lpBalance,
                testHelper.valueToTokenAmount(marketAddress, chainId)
            );
            if (liquidityRemove.eq(0)) {
                throw new Error('Skip test because liquidityRemove is 0');
            }
            tokenBalanceBefore = pendleSDK.assertDefined(tokenBalancesBefore[token.address]);
        });

        it('should have user balance transferred correctly', async () => {
            const readerResult = await sendTxWithInfApproval(
                () =>
                    router.removeLiquidityDualTokenAndPt(
                        marketAddress,
                        liquidityRemove,
                        token.address,
                        constants.SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [marketAddress]
            );

            const [lpBalanceAfter, tokenBalanceAfter, ptBalanceAfter] = await tokenHelper.getUserBalances(
                signerAddress,
                [marketAddress, token.address, ptAddress]
            );

            expect([balanceSnapshotBefore.lpBalance, lpBalanceAfter]).toHaveDifferenceBN(liquidityRemove.mul(-1));
            expect([balanceSnapshotBefore.ptBalance, ptBalanceAfter]).toHaveDifferenceBN(
                readerResult.netPtOut,
                constants.EPSILON_FOR_AGGREGATOR
            );

            const netTokenOut = (await readerResult.route.getNetOut())!;
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerResult.gas.nativeSpent) : netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
        });
    });
}
