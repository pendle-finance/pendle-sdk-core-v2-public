import * as pendleSDK from '../../src';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as tokenHelper from '../util/tokenHelper';
import * as testEnv from '../util/testEnv';
import {
    router,
    marketAddress,
    signerAddress,
    chainId,
    balanceSnapshotBefore,
    sendTxWithInfApproval,
    getSwapBalanceSnapshot,
    tokensOutToTest,
} from './setup';

describe('Router#removeLiquiditySinglePt', () => {
    sharedTestRemoveLiquiditySingleToken();

    describe('with expired market', () => {
        const DAY_ms = 24 * 60 * 60 * 1000;
        describe('after expiry', () => {
            testHelper.useSetTime(new Date(testEnv.currentConfig.market.expiry_ms + DAY_ms));
            sharedTestRemoveLiquiditySingleToken();
        });
    });
});

function sharedTestRemoveLiquiditySingleToken() {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
        ...tokensOutToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ];
    const tokenBalancesBefore: Record<pendleSDK.Address, pendleSDK.BN> = {};
    beforeAll(async () => {
        await Promise.all(
            tokensToTest.map(async ({ address }) => {
                tokenBalancesBefore[address] = await tokenHelper.getBalance(address, signerAddress);
            })
        );
    });

    let liquidityRemove: pendleSDK.BN;
    beforeAll(async () => {
        liquidityRemove = pendleSDK.bnMin(
            balanceSnapshotBefore.lpBalance,
            testHelper.valueToTokenAmount(marketAddress, chainId)
        );
        if (liquidityRemove.eq(0)) {
            throw new Error('skip test because liquidityRemove is 0');
        }
    });

    describe.each(tokensToTest)('With $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        let tokenBalanceBefore: pendleSDK.BN;
        beforeAll(async () => {
            tokenBalanceBefore = tokenBalancesBefore[token.address];
        });
        it('should have user balance transferred correctly', async () => {
            const readerData = await sendTxWithInfApproval(
                () =>
                    router.removeLiquiditySingleToken(
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

            const [balanceSnapshotAfter, tokenBalanceAfter] = await Promise.all([
                getSwapBalanceSnapshot(),
                tokenHelper.getBalance(token.address, signerAddress),
            ]);

            expect([balanceSnapshotBefore.lpBalance, balanceSnapshotAfter.lpBalance]).toHaveDifferenceBN(
                liquidityRemove.mul(-1)
            );

            const netTokenOut = readerData.netTokenOut;
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerData.gas.nativeSpent) : netTokenOut,
                // netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
        });
    });
}
