import * as pendleSDK from '../../src';
import * as testEnv from '../util/testEnv';
import * as testHelper from '../util/testHelper';
import * as tokenHelper from '../util/tokenHelper';
import * as constants from '../util/constants';
import * as marketData from '../util/marketData';

import { router, tokensInToTest, chainId, signerAddress, sendTxWithInfApproval } from './setup';

describe.skip('Miscellaneous Router tests', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    // TODO abstract routing algorithm to test the core part
    // So that the test is contract independent
    //
    // TODO fix bug:
    // - For different sy cases, the remove liquidity part not working _correctly_ as
    // the add liq part of the routing algo currently only looked at the user token balance.
    // If the user does not have enough balance, and the router was not approved,
    // the _preview_ algo is fallbacked, which is undesirable.
    //
    // Fixing this purely on SDK require using Pendle RouterV3 contract's multicall method.
    // Or Pendle RouterV2 contract's batch exec method.

    describe('test route error', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        const checkErrorRouter = pendleSDK.Router.getRouter({
            ...testEnv.currentConfig.routerConfig,
            checkErrorOnSimulation: true,
        });
        testHelper.itWhen(chainId === 1)('check simulation error for all routes', async () => {
            const closedMarketAddress = pendleSDK.toAddress('0xfcbae4635ca89866f83add208ecceec742678746');
            const tokenIn = tokensInToTest[0].address;
            const tokenAddAmount = pendleSDK.bnMin(
                testHelper.valueToTokenAmount(tokenIn, chainId),
                await tokenHelper.getBalance(tokenIn, signerAddress)
            );

            if (tokenAddAmount.eq(0)) {
                throw new Error(
                    `[${
                        (await tokenHelper.getERC20Name(tokenIn)) + ' ' + tokenIn
                    }}] Skip test because tokenAddAmount is 0`
                );
            }

            return sendTxWithInfApproval(
                () =>
                    checkErrorRouter.addLiquiditySingleToken(
                        closedMarketAddress,
                        tokenIn,
                        tokenAddAmount,
                        constants.SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [tokenIn]
            ).catch((e) => {
                expect(e).toBeInstanceOf(pendleSDK.NoRouteFoundError);
            });
        });
    });

    it.skip('#sellSys', async () => {
        const sys = marketData.getAllMarketData(chainId, false).map(({ syAddress }) => syAddress);
        const syDecimals = await Promise.all(sys.map((x) => tokenHelper.getERC20Decimals(x)));

        // convert 1 sy
        const netSyIns = syDecimals.map((x) => pendleSDK.decimalFactor(x));
        const receiver = pendleSDK.toAddress(testEnv.currentConfig.userAddress);

        // specificlly looking for USDC to be deterministic
        const USDC = pendleSDK.assertDefined(
            testEnv.currentConfig.unfilteredZappableTokensToTest.find(({ name }) => name.includes('USDC'))
        );

        const results = await router.sellSys(USDC.address, constants.SLIPPAGE_TYPE2, { sys, netSyIns }, { receiver });

        const _simplifiedResults = results.map((x) => ({
            kyberRouter: x.swapData.extRouter,
            tokenRedeemSy: x.tokenRedeemSy,
            minTokenOut: x.minTokenOut.toString(),
        }));

        expect(
            results.every(
                (x) =>
                    x.swapData.extCalldata.length == 0 ||
                    x.swapData.extCalldata.toString().includes(receiver.replace('0x', ''))
            )
        ).toBeTruthy();

        // console.log(simplifiedResults);
    });
});
