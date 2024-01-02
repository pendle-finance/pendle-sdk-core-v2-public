import * as pendleSDK from '../../src';
import * as testEnv from '../util/testEnv';
import * as testHelper from '../util/testHelper';
import * as tokenHelper from '../util/tokenHelper';
import * as constants from '../util/constants';
import * as marketData from '../util/marketData';
import { BigNumber as BN } from 'ethers';

import { router, tokensInToTest, chainId, signerAddress, signer, sendTxWithInfApproval } from './setup';

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
    describe('migrate liquidity', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        const allMarketData = marketData.getAllMarketData(chainId, false);
        function findMarketsWithSameSy() {
            for (const srcMarket of allMarketData) {
                for (const dstMarket of allMarketData) {
                    if (dstMarket.expiry_ms < Date.now()) continue;
                    if (srcMarket.marketAddress === dstMarket.marketAddress) continue;
                    if (srcMarket.syAddress != dstMarket.syAddress) continue;
                    return [srcMarket, dstMarket];
                }
            }
            throw new Error('no markets with same sy');
        }

        function findMarketsWithDifferentSy() {
            for (const srcMarket of allMarketData) {
                for (const dstMarket of allMarketData) {
                    if (dstMarket.expiry_ms < Date.now()) continue;
                    if (srcMarket.marketAddress === dstMarket.marketAddress) continue;
                    if (srcMarket.syAddress === dstMarket.syAddress) continue;
                    return [srcMarket, dstMarket];
                }
            }
            throw new Error('no markets with different sy');
        }

        const tests = {
            'same sy normal': {
                getMarkets: findMarketsWithSameSy,
                sameSy: true,
                keepYt: false,
                redeemRewards: false,
            },
            'same sy keep yt': {
                getMarkets: findMarketsWithSameSy,
                sameSy: true,
                keepYt: true,
                redeemRewards: false,
            },
            'different sy normal': {
                getMarkets: findMarketsWithDifferentSy,
                sameSy: false,
                keepYt: false,
                redeemRewards: false,
            },
            'different sy keep yt': {
                getMarkets: findMarketsWithDifferentSy,
                sameSy: false,
                keepYt: true,
                redeemRewards: false,
            },
            'same sy normal claim rewards': {
                getMarkets: findMarketsWithSameSy,
                sameSy: true,
                keepYt: false,
                redeemRewards: true,
            },
            'same sy keep yt claim rewards': {
                getMarkets: findMarketsWithSameSy,
                sameSy: true,
                keepYt: true,
                redeemRewards: true,
            },
            'different sy normal claim rewards': {
                getMarkets: findMarketsWithDifferentSy,
                sameSy: false,
                keepYt: false,
                redeemRewards: true,
            },
            'different sy keep yt claim rewards': {
                getMarkets: findMarketsWithDifferentSy,
                sameSy: false,
                keepYt: true,
                redeemRewards: true,
            },
        };

        // TODO better way to filter this
        // const testData = Object.entries(tests).filter(([, data]) => {
        //     try {
        //         data.getMarkets();
        //         return true;
        //     } catch {
        //         return false;
        //     }
        // });
        // console.log(testData);

        it.each(Object.entries(tests))('%s', async (_, { getMarkets, sameSy, keepYt, redeemRewards }) => {
            const [srcMarket, dstMarket] = getMarkets();
            const [srcMarketAddress, dstMarketAddress] = [srcMarket.marketAddress, dstMarket.marketAddress];
            const rewardTokens = srcMarket.rewardTokens.map(({ address }) => address);
            await testHelper.setPendleERC20Balance(srcMarketAddress, signerAddress, pendleSDK.decimalFactor(18));

            // ping the transfer to update the market rewards
            await tokenHelper.transfer(srcMarketAddress, pendleSDK.NATIVE_ADDRESS_0xEE, BN.from(0));

            const balanceBefore = await tokenHelper.getUserBalances(signerAddress, [
                srcMarketAddress,
                dstMarketAddress,
                dstMarket.ytAddress,
            ]);
            const lpToRemoveAmount = pendleSDK.bnMin(
                testHelper.valueToTokenAmount(srcMarketAddress, chainId),
                balanceBefore[0]
            );
            const rewardBalancesBefore = await tokenHelper.getUserBalances(signerAddress, rewardTokens);
            await tokenHelper.batchApprove([
                { token: srcMarketAddress, spender: router.address },
                { token: srcMarketAddress, spender: router.getRouterHelper().address },
            ]);

            const getMetaCall = async () => {
                if (sameSy) {
                    if (keepYt) {
                        return router.migrateLiquidityViaSharedSyKeepYt(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            constants.SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                                redeemRewards,
                            }
                        );
                    } else {
                        return router.migrateLiquidityViaSharedSy(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            constants.SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                                redeemRewards,
                            }
                        );
                    }
                } else {
                    const tokensOutData = srcMarket.tokensOut;
                    const WRAPPED_NATIVE = pendleSDK.getContractAddresses(chainId).WRAPPED_NATIVE;
                    const tokenRedeemSy = (
                        tokensOutData.find((x) => x.name.includes('USDC') || x.address === WRAPPED_NATIVE) ??
                        tokensOutData[0]
                    ).address;
                    if (keepYt) {
                        return router.migrateLiquidityViaTokenRedeemSyKeepYt(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            tokenRedeemSy,
                            constants.SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                                redeemRewards,
                            }
                        );
                    } else {
                        return router.migrateLiquidityViaTokenRedeemSy(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            tokenRedeemSy,
                            constants.SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                                redeemRewards,
                            }
                        );
                    }
                }
            };

            const metaCall = await getMetaCall();
            await metaCall
                .connect(signer)
                .send()
                .then((tx) => tx.wait(testEnv.BLOCK_CONFIRMATION));

            const readerData = metaCall.data;
            const balanceAfter = await tokenHelper.getUserBalances(signerAddress, [
                srcMarketAddress,
                dstMarketAddress,
                dstMarket.ytAddress,
            ]);
            const addLiquidityMetaMethod =
                'addLiquidityRoute' in readerData
                    ? await readerData.addLiquidityRoute.buildCall()
                    : readerData.addLiquidityMetaMethod;

            expect(balanceBefore[0].sub(balanceAfter[0])).toEqBN(lpToRemoveAmount);
            expect(balanceAfter[1].sub(balanceBefore[1])).toEqBN(
                addLiquidityMetaMethod.data.netLpOut,
                constants.EPSILON_FOR_AGGREGATOR
            );

            if (keepYt) {
                const netYtOut =
                    'netYtOut' in addLiquidityMetaMethod.data ? addLiquidityMetaMethod.data.netYtOut : BN.from(-1);
                expect(balanceAfter[2].sub(balanceBefore[2])).toEqBN(netYtOut, constants.EPSILON_FOR_AGGREGATOR);
            } else {
                expect(balanceAfter[2].sub(balanceBefore[2])).toEqBN(0);
            }

            const rewardBalancesAfter = await tokenHelper.getUserBalances(signerAddress, rewardTokens);
            if (redeemRewards) {
                expect(rewardBalancesAfter.some((balance, i) => balance.gt(rewardBalancesBefore[i]))).toBeTruthy();
            } else {
                expect(rewardBalancesAfter.every((balance, i) => balance.eq(rewardBalancesBefore[i]))).toBeTruthy();
            }

            // const callData = await metaCall.extractParams();
            // console.log(callData);
        });
    });

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
