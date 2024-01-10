import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import * as swapAmountCalculator from './swapAmountCalculator';

import {
    ptAddress,
    ytAddress,
    signerAddress,
    balanceSnapshotBefore,
    getSwapBalanceSnapshot,
    tokensInToTest,
    router,
    sendTxWithInfApproval,
} from './setup';

describe('Router#redeemPyToToken', () => {
    sharedTests({ isTestingAfterExpiry: false });

    describe('with expired market', () => {
        const DAY_ms = 24 * 60 * 60 * 1000;
        describe('after expiry', () => {
            testHelper.useSetTime(new Date(testEnv.currentConfig.market.expiry_ms + DAY_ms));
            sharedTests({ isTestingAfterExpiry: true });
        });
    });
});

function sharedTests(testParams: { isTestingAfterExpiry: boolean }) {
    const tokensToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00, disableTesting: false },
        ...tokensInToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ].filter(({ disableTesting }) => !disableTesting);

    const tokenBalancesBefore: Record<pendleSDK.Address, pendleSDK.BN> = {};
    let ytBalanceBefore: pendleSDK.BN;
    let ptBalanceBefore: pendleSDK.BN;
    beforeAll(async () => {
        const getTokenBalancePromises = tokensToTest.map(async (token) => {
            const balance = await tokenHelper.getBalance(token.address, signerAddress);
            tokenBalancesBefore[token.address] = balance;
        });
        const getYtBalancePromise = tokenHelper.getBalance(ytAddress, signerAddress);
        const getPtBalancePromise = tokenHelper.getBalance(ptAddress, signerAddress);
        [ytBalanceBefore, ptBalanceBefore] = await Promise.all([
            getYtBalancePromise,
            getPtBalancePromise,
            ...getTokenBalancePromises,
        ]);
    });

    let netPyToSwap: pendleSDK.BN;
    beforeAll(async () => {
        netPyToSwap = swapAmountCalculator.getPyRedeemAmount(balanceSnapshotBefore);
        if (netPyToSwap.eq(0)) {
            throw new Error('Skip test because netPyToSwap is 0');
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
                    router.redeemPyToToken(ytAddress, netPyToSwap, token.address, constants.SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ytAddress, ptAddress]
            );

            const [balanceSnapshotAfter, tokenBalanceAfter] = await Promise.all([
                getSwapBalanceSnapshot(),
                tokenHelper.getBalance(token.address, signerAddress),
            ]);

            const { netTokenOut } = readerData;
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                pendleSDK.isNativeToken(token.address) ? netTokenOut.sub(readerData.gas.nativeSpent) : netTokenOut,
                constants.EPSILON_FOR_AGGREGATOR
            );

            expect([ptBalanceBefore, balanceSnapshotAfter.ptBalance]).toHaveDifferenceBN(netPyToSwap.mul(-1));
            const expectedYtChange = testParams.isTestingAfterExpiry ? 0 : netPyToSwap.mul(-1);
            expect([ytBalanceBefore, balanceSnapshotAfter.ytBalance]).toHaveDifferenceBN(expectedYtChange);
        });
    });
}
