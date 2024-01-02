import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import {
    ytAddress,
    signerAddress,
    balanceSnapshotBefore,
    getSwapBalanceSnapshot,
    tokensInToTest,
    chainId,
    router,
    sendTxWithInfApproval,
} from './setup';

describe('Router#mintPyFromToken', () => {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00, disableTesting: false },
        ...tokensInToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ].filter(({ disableTesting }) => !disableTesting);

    const tokenBalances: Record<pendleSDK.Address, pendleSDK.BN> = {};
    beforeAll(async () => {
        await Promise.all(
            tokensToTest.map(async (token) => {
                const balance = await tokenHelper.getBalance(token.address, signerAddress);
                tokenBalances[token.address] = balance;
            })
        );
    });

    describe.each(tokensToTest)('with $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        let tokenBalanceBefore: pendleSDK.BN;
        let exactTokenIn: pendleSDK.BN;

        beforeAll(async () => {
            tokenBalanceBefore = tokenBalances[token.address];
            exactTokenIn = pendleSDK.bnMin(testHelper.valueToTokenAmount(token.address, chainId), tokenBalanceBefore);
            if (exactTokenIn.eq(0)) {
                throw new Error('skip test because exactTokenIn is 0');
            }
        });

        it('should have user balance transferred correctly', async () => {
            const readerData = await sendTxWithInfApproval(
                () =>
                    router.mintPyFromToken(ytAddress, token.address, exactTokenIn, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [token.address]
            );

            const [balanceSnapshotAfter, tokenBalanceAfter] = await Promise.all([
                getSwapBalanceSnapshot(),
                tokenHelper.getBalance(token.address, signerAddress),
            ]);

            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                (pendleSDK.isNativeToken(token.address)
                    ? exactTokenIn.add(readerData.gas.nativeSpent)
                    : exactTokenIn
                ).mul(-1)
            );

            expect([balanceSnapshotBefore.ytBalance, balanceSnapshotAfter.ytBalance]).toHaveDifferenceBN(
                readerData.netPyOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([balanceSnapshotBefore.ptBalance, balanceSnapshotAfter.ptBalance]).toHaveDifferenceBN(
                readerData.netPyOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
        });
    });
});
