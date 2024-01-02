import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';
import * as testEnv from '../util/testEnv';

import { tokensInToTest, marketAddress, signerAddress, chainId, router, sendTxWithInfApproval } from './setup';

describe('Router#addLiquiditySingleToken', () => {
    let lpBalanceBefore: pendleSDK.BN;

    beforeAll(async () => {
        lpBalanceBefore = await tokenHelper.getBalance(marketAddress, signerAddress);
    });

    const tokenToTest = [
        { name: 'native token', address: pendleSDK.NATIVE_ADDRESS_0x00 },
        ...tokensInToTest,
        ...testEnv.currentConfig.zappableTokensToTest,
    ];

    describe.each(tokenToTest)('With $name ($address)', (token) => {
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
                    router.addLiquiditySingleToken(
                        marketAddress,
                        token.address,
                        tokenAddAmount,
                        constants.SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [token.address]
            );

            const tx = readerData.txReceipt;
            const gasPrice = tx.effectiveGasPrice;
            const gasUsed = tx.gasUsed;
            const gasUsedInEth = gasUsed.mul(gasPrice);
            const [lpBalanceAfter, tokenBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
                marketAddress,
                token.address,
            ]);

            expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(
                readerData.netLpOut,
                constants.EPSILON_FOR_AGGREGATOR
            );
            expect([tokenBalanceBefore, tokenBalanceAfter]).toHaveDifferenceBN(
                (pendleSDK.isNativeToken(token.address) ? tokenAddAmount.add(gasUsedInEth) : tokenAddAmount).mul(-1)
            );
        });
    });
});
