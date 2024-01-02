import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import {
    tokensOutToTest,
    marketAddress,
    ytAddress,
    signerAddress,
    chainId,
    router,
    sendTxWithInfApproval,
    balanceSnapshotBefore,
} from './setup';

describe('Router#swapExactYtForToken', () => {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
        ...tokensOutToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ];

    const tokenBalancesBefore: Record<pendleSDK.Address, pendleSDK.BN> = {};
    beforeAll(async () => {
        await Promise.all(
            tokensToTest.map(async (token) => {
                const balance = await tokenHelper.getBalance(token.address, signerAddress);
                tokenBalancesBefore[token.address] = balance;
            })
        );
    });

    let ytSwapAmount: pendleSDK.BN;
    beforeAll(async () => {
        ytSwapAmount = pendleSDK.bnMin(
            balanceSnapshotBefore.ptBalance,
            testHelper.valueToTokenAmount(ytAddress, chainId)
        );
        if (ytSwapAmount.eq(0)) {
            throw new Error('Skip test because ytSwapAmount is 0');
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
                    router.swapExactYtForToken(marketAddress, ytSwapAmount, token.address, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ytAddress]
            );

            const [ytBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                ytAddress,
                token.address,
            ]);

            expect([balanceSnapshotBefore.ytBalance, ytBalanceAfter]).toHaveDifferenceBN(ytSwapAmount.mul(-1));

            const netTokenOut = pendleSDK.assertDefined(await readerData.route.getNetOut());
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerData.gas.nativeSpent) : netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
        });
    });
});
