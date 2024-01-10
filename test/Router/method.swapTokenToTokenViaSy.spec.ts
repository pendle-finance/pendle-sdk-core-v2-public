import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as iters from 'itertools';
import * as testHelper from '../util/testHelper';
import * as testEnv from '../util/testEnv';
import * as constants from '../util/constants';

import { router, signerAddress, chainId, sendTxWithInfApproval, tokensOutToTest, syAddress } from './setup';

// eslint-disable-next-line @typescript-eslint/unbound-method
describe(pendleSDK.Router.prototype.swapTokenToTokenViaSy, () => {
    const pairsTokenToTest = [
        ...iters.flatmap(iters.take(2, tokensOutToTest), (tokenOut) => [
            { fromToken: tokenHelper.NATIVE_TOKEN_0x00, toToken: tokenOut },
            ...testEnv.currentConfig.zappableTokensToTest.map((tok) => ({
                fromToken: tok,
                toToken: tokenOut,
            })),
        ]),
    ];

    const uniqueTokensToTest = iters.uniqueEverseen(
        iters.flatmap(pairsTokenToTest, ({ fromToken, toToken }) => [fromToken.address, toToken.address])
    );
    const tokenBalances = tokenHelper.getTokenBalancesBeforeTesting(signerAddress, uniqueTokensToTest);

    const nameTemplate = 'swap $fromToken.name ($fromToken.address) -> $toToken.name ($toToken.address)';
    describe.each(pairsTokenToTest)(nameTemplate, ({ fromToken, toToken }) => {
        let fromTokenBalanceBefore: pendleSDK.BN;
        let toTokenBalanceBefore: pendleSDK.BN;
        beforeAll(() => {
            fromTokenBalanceBefore = tokenBalances[fromToken.address];
            toTokenBalanceBefore = tokenBalances[toToken.address];
        });

        let swapAmount: pendleSDK.BN;
        let input: pendleSDK.RawTokenAmount;
        beforeAll(() => {
            swapAmount = pendleSDK.bnMin(
                testHelper.valueToTokenAmount(fromToken.address, chainId),
                fromTokenBalanceBefore
            );
            input = { token: fromToken.address, amount: swapAmount };
        });

        let metaMethod: pendleSDK.MetaMethodForRouterMethod<pendleSDK.Router['swapTokenToTokenViaSy']>;
        beforeAll(async () => {
            metaMethod = await router.swapTokenToTokenViaSy(
                syAddress,
                input,
                toToken.address,
                constants.SLIPPAGE_TYPE2,
                {
                    method: 'meta-method',
                }
            );
        });

        it('should not have SIGNIFICANTLY small output', () => {
            const equivalentAmountViaSpotPrice = testHelper.convertValueViaSpotPrice(chainId, input, toToken.address);
            const output = metaMethod.data.netTokenOut;
            const EPS = 1 / 10; // yes, 10%
            expect(output).toEqBN(equivalentAmountViaSpotPrice, EPS);
        });
        describe('sent tx', () => {
            testHelper.useRestoreEvmSnapShotAfterEach();

            (pendleSDK.isNativeToken(fromToken.address) ? it.skip : it)(
                'should revert when signed have not approved',
                async () => {
                    await tokenHelper.approve(fromToken.address, router.address, 0);
                    // console.log(await tokenHelper.getAllowance(fromToken.address, signerAddress);
                    await expect(() => metaMethod.send()).rejects.toThrowError();
                }
            );

            it('should have user balance transferred correctly', async () => {
                const readerData = await sendTxWithInfApproval(() => metaMethod, [fromToken.address]);
                const [fromTokenBalanceAfter, toTokenBalanceAfter] = await Promise.all([
                    tokenHelper.getBalance(fromToken.address, signerAddress),
                    tokenHelper.getBalance(toToken.address, signerAddress),
                ]);

                expect([fromTokenBalanceBefore, fromTokenBalanceAfter]).toHaveDifferenceBN(
                    input.amount
                        .add(pendleSDK.isNativeToken(fromToken.address) ? readerData.gas.nativeSpent : 0)
                        .mul(-1)
                );
                expect([toTokenBalanceBefore, toTokenBalanceAfter]).toHaveDifferenceBN(
                    readerData.netTokenOut.sub(
                        pendleSDK.isNativeToken(toToken.address) ? readerData.gas.nativeSpent : 0
                    ),
                    constants.EPSILON_FOR_AGGREGATOR
                );
            });
        });
    });
});
