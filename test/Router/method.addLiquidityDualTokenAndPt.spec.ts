import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import * as iters from 'itertools';

import {
    tokensInToTest,
    ptAddress,
    marketAddress,
    signerAddress,
    chainId,
    router,
    sendTxWithInfApproval,
} from './setup';

describe('Router#addLiquidityDualTokenAndPt', () => {
    let ptBalanceBefore: pendleSDK.BN;
    let lpBalanceBefore: pendleSDK.BN;
    let ptAdd: pendleSDK.BN;

    beforeAll(async () => {
        [ptBalanceBefore, lpBalanceBefore] = await Promise.all([
            tokenHelper.getBalance(ptAddress, signerAddress),
            tokenHelper.getBalance(marketAddress, signerAddress),
        ]);
        ptAdd = pendleSDK.bnMin(testHelper.valueToTokenAmount(ptAddress, chainId), ptBalanceBefore);
        if (ptAdd.eq(0)) {
            throw new Error('Skip test because ptAdd is 0');
        }
    });

    const tokensToTests = iters.uniqueEverseen(
        [
            { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
            ...tokensInToTest,
            ...testEnv.currentConfig.zappableTokensToTest,
        ],
        (key) => key.address
    );
    describe.each([...tokensToTests])('With tokenIn $name ($address)', (token) => {
        testHelper.useRestoreEvmSnapShotAfterEach();

        let tokenBalanceBefore: pendleSDK.BN;
        let tokenAddAmount: pendleSDK.BN;

        beforeAll(async () => {
            tokenBalanceBefore = await tokenHelper.getBalance(token.address, signerAddress);
            tokenAddAmount = pendleSDK.bnMin(testHelper.valueToTokenAmount(token.address, chainId), tokenBalanceBefore);
            if (tokenAddAmount.eq(0)) {
                throw new Error('Skip test because tokenAddAmount is 0');
            }
        });

        it('should have user balance transferred correctly', async () => {
            const readerData = await sendTxWithInfApproval(
                () =>
                    router.addLiquidityDualTokenAndPt(
                        testEnv.currentConfig.marketAddress,
                        token.address,
                        tokenAddAmount,
                        ptAdd,
                        constants.SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [token.address, ptAddress]
            );
            const [lpBalanceAfter, ptBalanceAfter] = await Promise.all([
                tokenHelper.getBalance(marketAddress, signerAddress),
                tokenHelper.getBalance(ptAddress, signerAddress),
            ]);
            expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(
                readerData.netLpOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([ptBalanceBefore, ptBalanceAfter]).toHaveDifferenceBN(
                readerData.netPtUsed.mul(-1),
                constants.DEFAULT_EPSILON
            );

            // There was tokenUsed, but because of a change in the routing algorithm,
            // this infomation was no longer included.
            //
            // Though testing against lp and pt is good enough for now.
        });
    });
});
