import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import {
    tokensOutToTest,
    marketAddress,
    ptAddress,
    signerAddress,
    chainId,
    router,
    sendTxWithInfApproval,
    balanceSnapshotBefore,
} from './setup';

describe('Router#swapExactPtForToken', () => {
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

    let ptSwapAmount: pendleSDK.BN;
    beforeAll(async () => {
        ptSwapAmount = pendleSDK.bnMin(
            balanceSnapshotBefore.ptBalance,
            testHelper.valueToTokenAmount(ptAddress, chainId)
        );
        if (ptSwapAmount.eq(0)) {
            throw new Error('Skip test because ptSwapAmount is 0');
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
                    router.swapExactPtForToken(marketAddress, ptSwapAmount, token.address, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ptAddress]
            );

            const [ptBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                ptAddress,
                token.address,
            ]);

            expect([balanceSnapshotBefore.ptBalance, ptBalanceAfter]).toHaveDifferenceBN(ptSwapAmount.mul(-1));

            const { netTokenOut } = readerData;
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerData.gas.nativeSpent) : netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
        });
    });
});
