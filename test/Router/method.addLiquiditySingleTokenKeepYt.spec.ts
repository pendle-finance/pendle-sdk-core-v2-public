import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';
import * as iters from 'itertools';

import {
    tokensInToTest,
    ytAddress,
    marketAddress,
    signerAddress,
    chainId,
    router,
    sendTxWithInfApproval,
} from './setup';

describe('Router#addLiquiditySingleTokenKeepYt', () => {
    let lpBalanceBefore: pendleSDK.BN;
    let ytBalanceBefore: pendleSDK.BN;

    beforeAll(async () => {
        [lpBalanceBefore, ytBalanceBefore] = await Promise.all([
            tokenHelper.getBalance(marketAddress, signerAddress),
            tokenHelper.getBalance(ytAddress, signerAddress),
        ]);
    });

    const tokenToTest = iters.uniqueEverseen(
        [
            { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00, disableTesting: false },
            ...tokensInToTest,
            ...testEnv.currentConfig.zappableTokensToTest,
        ],
        (value) => value.address
    );
    describe.each([...tokenToTest])('With $name ($address)', (token) => {
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
            const readerData = await sendTxWithInfApproval(async () => {
                const metacall = await router.addLiquiditySingleTokenKeepYt(
                    marketAddress,
                    token.address,
                    tokenAddAmount,
                    constants.SLIPPAGE_TYPE2,
                    {
                        method: 'meta-method',
                    }
                );
                return metacall;
            }, [token.address]);

            const [lpBalanceAfter, ytBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(
                signerAddress,
                [marketAddress, ytAddress, token.address]
            );

            expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(
                readerData.netLpOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([ytBalanceBefore, ytBalanceAfter]).toHaveDifferenceBN(
                readerData.netYtOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                (pendleSDK.isNativeToken(token.address)
                    ? tokenAddAmount.add(readerData.gas.nativeSpent)
                    : tokenAddAmount
                ).mul(-1)
            );
        });
    });
});
