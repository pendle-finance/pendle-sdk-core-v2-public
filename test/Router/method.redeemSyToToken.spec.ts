import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import * as swapAmountCalculator from './swapAmountCalculator';

import {
    syAddress,
    signerAddress,
    balanceSnapshotBefore,
    getSwapBalanceSnapshot,
    tokensInToTest,
    router,
    sendTxWithInfApproval,
} from './setup';

describe('Router#redeemSyFromToken', () => {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00, disableTesting: false },
        ...tokensInToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ].filter(({ disableTesting }) => !disableTesting);

    const tokenBalancesBefore: Record<pendleSDK.Address, pendleSDK.BN> = {};
    beforeAll(async () => {
        await Promise.all(
            tokensToTest.map(async (token) => {
                const balance = await tokenHelper.getBalance(token.address, signerAddress);
                tokenBalancesBefore[token.address] = balance;
            })
        );
    });

    let netSyToSwap: pendleSDK.BN;
    beforeAll(async () => {
        netSyToSwap = swapAmountCalculator.getSyRedeemAmount(balanceSnapshotBefore);
        if (netSyToSwap.eq(0)) {
            throw new Error('Skip test because netSyToSwap is 0');
        }
    });

    describe.each(tokensToTest)('with $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        let tokenBalanceBefore: pendleSDK.BN;
        beforeAll(async () => {
            tokenBalanceBefore = tokenBalancesBefore[token.address];
        });

        it('should have user balance transferred correctly', async () => {
            const readerData = await sendTxWithInfApproval(
                () =>
                    router.redeemSyToToken(syAddress, netSyToSwap, token.address, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            const [balanceSnapshotAfter, tokenBalanceAfter] = await Promise.all([
                getSwapBalanceSnapshot(),
                tokenHelper.getBalance(token.address, signerAddress),
            ]);

            const netTokenOut = readerData.netTokenOut;
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerData.gas.nativeSpent) : netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );

            expect([balanceSnapshotBefore.syBalance, balanceSnapshotAfter.syBalance]).toHaveDifferenceBN(
                netSyToSwap.mul(-1)
            );
        });
    });
});
