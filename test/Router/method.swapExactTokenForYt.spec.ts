import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import {
    tokensInToTest,
    marketAddress,
    ytAddress,
    signerAddress,
    chainId,
    router,
    sendTxWithInfApproval,
    balanceSnapshotBefore,
} from './setup';

describe('Router#swapExactTokenForYt', () => {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
        ...tokensInToTest,
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

    describe.each(tokensToTest)('With $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        let tokenBalanceBefore: pendleSDK.BN;
        let tokenSwapAmount: pendleSDK.BN;

        beforeAll(async () => {
            tokenBalanceBefore = tokenBalancesBefore[token.address];
            tokenSwapAmount = pendleSDK.bnMin(
                testHelper.valueToTokenAmount(token.address, chainId),
                tokenBalanceBefore
            );

            if (tokenSwapAmount.eq(0)) {
                throw new Error('Skip test because tokenSwapAmount is 0');
            }
        });

        it('should have user balance transferred correctly', async () => {
            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactTokenForYt(
                        marketAddress,
                        token.address,
                        tokenSwapAmount,
                        constants.SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [token.address]
            );

            const [ytBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                ytAddress,
                token.address,
            ]);

            expect([balanceSnapshotBefore.ytBalance, ytBalanceAfter]).toHaveDifferenceBN(
                readerData.netYtOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                (pendleSDK.isNativeToken(token.address)
                    ? tokenSwapAmount.add(readerData.gas.nativeSpent)
                    : tokenSwapAmount
                ).mul(-1)
            );
        });
    });
});
