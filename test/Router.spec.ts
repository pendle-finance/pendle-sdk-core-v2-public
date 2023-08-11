import {
    decimalFactor,
    ContractMetaMethod,
    Router,
    SyEntity,
    MetaMethodData,
    Address,
    toAddress,
    MarketEntity,
    NATIVE_ADDRESS_0xEE,
    areSameAddresses,
    getContractAddresses,
    isNativeToken,
} from '../src';
import {
    currentConfig,
    describeWrite,
    networkConnectionWithChainId,
    BLOCK_CONFIRMATION,
    signer,
    ACTIVE_CHAIN_ID,
} from './util/testEnv';
import {
    getBalance,
    evm_snapshot,
    evm_revert,
    getERC20Decimals,
    approveInfHelper,
    approveHelper,
    getERC20Name,
    bnMinAsBn,
    setPendleERC20Balance,
    increaseNativeBalance,
    setERC20Balance,
    getUserBalances,
    transferHelper,
    valueToTokenAmount,
    getAllAssets,
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import { IPAllAction, PendleRouterHelper } from '@pendle/core-v2/typechain-types';
import {
    DEFAULT_EPSILON,
    REDEEM_FACTOR,
    SLIPPAGE_TYPE2,
    MARKET_SWAP_FACTOR,
    BALANCE_OF_STORAGE_SLOT,
    EPSILON_FOR_AGGREGATOR,
} from './util/constants';
import { AsyncOrSync } from 'ts-essentials';
import { TransactionReceipt } from '@ethersproject/abstract-provider';

type BalanceSnapshot = {
    ptBalance: BN;
    syBalance: BN;
    ytBalance: BN;
    tokenBalance: BN;
    marketPtBalance: BN;
    marketSyBalance: BN;
};

type MetaMethodCallback = () =>
    | AsyncOrSync<ContractMetaMethod<IPAllAction, any, any>>
    | AsyncOrSync<ContractMetaMethod<PendleRouterHelper, any, any>>;
type SkipTxCheckCallback<T extends MetaMethodCallback> = (readerData: MetaMethodData<T>) => boolean;

describeWrite('Router', () => {
    const router = Router.getRouter(currentConfig.routerConfig);
    const signerAddress = networkConnectionWithChainId.signerAddress;
    const marketAddress = currentConfig.market.market;
    const syAddress = currentConfig.market.SY;
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;
    const rawTokenAddress = currentConfig.tokens.USDC;
    const sySdk = new SyEntity(syAddress, networkConnectionWithChainId);
    const marketEntity = new MarketEntity(marketAddress, networkConnectionWithChainId);
    const chainId = currentConfig.chainId;

    let zeroApprovalSnapshotId = '';

    beforeAll(async () => {
        // prepare balances
        await getAllAssets(chainId);
        const tokens = [syAddress, ptAddress, ytAddress, marketAddress];
        await Promise.all(
            tokens.map(async (token) => setPendleERC20Balance(token, signerAddress, valueToTokenAmount(token, chainId)))
        );
        await increaseNativeBalance(signerAddress);

        const tokensIn = [...(await sySdk.getTokensIn()), rawTokenAddress];
        await Promise.all(
            tokensIn.map(async (token) => {
                const slotInfo = BALANCE_OF_STORAGE_SLOT[token];
                if (!slotInfo) {
                    console.log(`No balanceOf slot info for ${await getERC20Name(token)} ${token}`);
                    return;
                }
                return setERC20Balance(token, signerAddress, valueToTokenAmount(token, chainId), ...slotInfo);
            })
        );

        // Approve router
        const toBeApproved = [
            syAddress,
            ptAddress,
            ytAddress,
            rawTokenAddress,
            marketAddress,
            await sySdk.getTokensIn(),
            await sySdk.getTokensOut(),
        ].flat();

        for (const token of toBeApproved) {
            await approveHelper(token, router.address, 0);
        }
        zeroApprovalSnapshotId = await evm_snapshot();
    });

    beforeEach(async () => {
        await switchToZeroApproval();
    });

    async function switchToZeroApproval() {
        await evm_revert(zeroApprovalSnapshotId);
        zeroApprovalSnapshotId = await evm_snapshot();
    }

    async function batchInfApprove(tokens: Address[]) {
        for (const token of tokens) {
            await approveInfHelper(token, router.address);
            await approveInfHelper(token, router.getRouterHelper().address);
        }
    }

    async function sendTxWithInfApproval<T extends MetaMethodCallback>(
        callback: T,
        tokens: Address[],
        skipTxCheck?: SkipTxCheckCallback<T>
    ): Promise<MetaMethodData<T> & { txReceipt: TransactionReceipt }> {
        const metaCall = await callback();

        if (skipTxCheck && skipTxCheck(metaCall.data)) {
            return metaCall.data;
        }

        await batchInfApprove(tokens);

        const txReceipt = await metaCall
            .connect(signer)
            .send()
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        return { ...metaCall.data, txReceipt };
    }

    it('#constructor', () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite('Overall write functions', () => {
        it('#redeemDueInterestAndRewards', async () => {
            const rewardTokens = await marketEntity.getRewardTokens();
            const balancesBefore = await getUserBalances(signerAddress, rewardTokens);
            // because we set our LP balance by editing storage slot, we need to trigger a
            // transfer so that the contract will calculate the rewards correctly
            await marketEntity.transfer(NATIVE_ADDRESS_0xEE, '0');
            await router.redeemDueInterestAndRewards({
                markets: [currentConfig.marketAddress],
            });
            const balancesAfter = await getUserBalances(signerAddress, rewardTokens);
            expect(balancesAfter.some((balance, i) => balance.gt(balancesBefore[i]))).toBeTruthy();
        });

        it('#addLiquidityDualSyAndPt', async () => {
            const syAdd = bnMinAsBn(valueToTokenAmount(syAddress, chainId), await getBalance(syAddress, signerAddress));
            const ptAdd = bnMinAsBn(valueToTokenAmount(ptAddress, chainId), await getBalance(ptAddress, signerAddress));

            if (syAdd.eq(0) || ptAdd.eq(0)) {
                throw new Error('skip test because syAdd or ptAdd is 0');
            }

            const lpBalanceBefore = await getBalance(marketAddress, signerAddress);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.addLiquidityDualSyAndPt(currentConfig.marketAddress, syAdd, ptAdd, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress, ptAddress]
            );

            const lpBalanceAfter = await getBalance(marketAddress, signerAddress);
            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
        });

        it('#addLiquidityDualTokenAndPt', async () => {
            const tokensIn = await sySdk.getTokensIn();
            for (const token of tokensIn) {
                const tokenDecimals = await getERC20Decimals(token);
                const tokenAddAmount = bnMinAsBn(
                    // Use small amount of token to make sure we will add all of them
                    // TODO: use actual logic to calculate the amount to add
                    decimalFactor(tokenDecimals),
                    await getBalance(token, signerAddress)
                );
                const ptAdd = bnMinAsBn(
                    valueToTokenAmount(ptAddress, chainId),
                    await getBalance(ptAddress, signerAddress)
                );

                if (tokenAddAmount.eq(0) || ptAdd.eq(0)) {
                    throw new Error(
                        `[${
                            (await getERC20Name(token)) + ' ' + token
                        }] Skip test because tokenAddAmount is ${tokenAddAmount.toString()}, ptAdd is ${ptAdd.toString()}`
                    );
                }

                const lpBalanceBefore = await getBalance(marketAddress, signerAddress);

                const readerData = await sendTxWithInfApproval(
                    () =>
                        router.addLiquidityDualTokenAndPt(
                            currentConfig.marketAddress,
                            token,
                            tokenAddAmount,
                            ptAdd,
                            SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                            }
                        ),
                    [token, ptAddress]
                );
                const lpBalanceAfter = await getBalance(marketAddress, signerAddress);
                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, EPSILON_FOR_AGGREGATOR);
                // for some technical reasons, we need to test all tokens inside a single test
                // so we need to revert manually instead of `afterEach`
                await switchToZeroApproval();
            }
        });

        it('#addLiquiditySinglePt', async () => {
            const ptAdd = bnMinAsBn(valueToTokenAmount(ptAddress, chainId), await getBalance(ptAddress, signerAddress));
            if (ptAdd.eq(0)) {
                throw new Error('skip test because ptAdd is 0');
            }
            const [lpBalanceBefore, ptBalanceBefore] = await getUserBalances(signerAddress, [marketAddress, ptAddress]);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.addLiquiditySinglePt(currentConfig.marketAddress, ptAdd, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ptAddress]
            );

            const [lpBalanceAfter, ptBalanceAfter] = await getUserBalances(signerAddress, [marketAddress, ptAddress]);

            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
            expect(ptBalanceBefore.sub(ptBalanceAfter)).toEqBN(ptAdd);
        });

        it('#addLiquiditySingleSy', async () => {
            const syAdd = bnMinAsBn(valueToTokenAmount(syAddress, chainId), await getBalance(syAddress, signerAddress));
            if (syAdd.eq(0)) {
                throw new Error('skip test because syAdd is 0');
            }
            const [lpBalanceBefore, syBalanceBefore] = await getUserBalances(signerAddress, [marketAddress, syAddress]);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.addLiquiditySingleSy(currentConfig.marketAddress, syAdd, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            if (readerData === undefined) throw new Error('readerData is undefined');

            const [lpBalanceAfter, syBalanceAfter] = await getUserBalances(signerAddress, [marketAddress, syAddress]);
            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
            expect(syBalanceBefore.sub(syBalanceAfter)).toEqBN(syAdd);
        });

        it('#addLiquiditySingleSyKeepYt', async () => {
            const syAdd = bnMinAsBn(valueToTokenAmount(syAddress, chainId), await getBalance(syAddress, signerAddress));
            if (syAdd.eq(0)) {
                throw new Error('skip test because syAdd is 0');
            }
            const [lpBalanceBefore, syBalanceBefore, ytBalanceBefore] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ytAddress,
            ]);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.addLiquiditySingleSyKeepYt(currentConfig.marketAddress, syAdd, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            if (readerData === undefined) throw new Error('readerData is undefined');

            const [lpBalanceAfter, syBalanceAfter, ytBalanceAfter] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ytAddress,
            ]);
            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
            expect(ytBalanceAfter.sub(ytBalanceBefore)).toEqBN(readerData.netYtOut, DEFAULT_EPSILON);
            expect(syBalanceBefore.sub(syBalanceAfter)).toEqBN(syAdd);
        });

        describeWrite('#addLiquiditySingleToken', () => {
            async function checkAddLiquiditySingleToken(token: Address) {
                const tokenAddAmount = bnMinAsBn(
                    valueToTokenAmount(token, chainId),
                    await getBalance(token, signerAddress)
                );

                if (tokenAddAmount.eq(0)) {
                    throw new Error(
                        `[${(await getERC20Name(token)) + ' ' + token}}] Skip test because tokenAddAmount is 0`
                    );
                }
                const [lpBalanceBefore, tokenBalanceBefore] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                ]);
                const readerData = await sendTxWithInfApproval(
                    () =>
                        router.addLiquiditySingleToken(
                            currentConfig.marketAddress,
                            token,
                            tokenAddAmount,
                            SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                            }
                        ),
                    [token]
                );

                const tx = readerData.txReceipt;
                const gasPrice = tx.effectiveGasPrice;
                const gasUsed = tx.gasUsed;
                const gasUsedInEth = gasUsed.mul(gasPrice);
                const [lpBalanceAfter, tokenBalanceAfter] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                ]);
                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, EPSILON_FOR_AGGREGATOR);
                if (!isNativeToken(token)) {
                    expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAddAmount);
                } else {
                    expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAddAmount.add(gasUsedInEth));
                }
            }

            it('raw token', async () => {
                await checkAddLiquiditySingleToken(rawTokenAddress);
            });

            it('tokens in sy', async () => {
                const tokensIn = await sySdk.getTokensIn();
                for (const token of tokensIn) {
                    await checkAddLiquiditySingleToken(token);
                    await switchToZeroApproval();
                }
            });
        });

        describeWrite('#addLiquiditySingleTokenKeepYt', () => {
            async function checkAddLiquiditySingleTokenKeepYt(token: Address) {
                const tokenAddAmount = bnMinAsBn(
                    valueToTokenAmount(token, chainId),
                    await getBalance(token, signerAddress)
                );

                if (tokenAddAmount.eq(0)) {
                    throw new Error(
                        `[${(await getERC20Name(token)) + ' ' + token}}] Skip test because tokenAddAmount is 0`
                    );
                }

                const [lpBalanceBefore, tokenBalanceBefore, ytBalanceBefore] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                    ytAddress,
                ]);

                const metaCall = await router.addLiquiditySingleTokenKeepYt(
                    currentConfig.marketAddress,
                    token,
                    tokenAddAmount,
                    SLIPPAGE_TYPE2,
                    {
                        method: 'meta-method',
                    }
                );
                const readerData = await sendTxWithInfApproval(
                    () => metaCall,
                    [token, getContractAddresses(currentConfig.chainId).WRAPPED_NATIVE]
                );
                const [lpBalanceAfter, tokenBalanceAfter, ytBalanceAfter] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                    ytAddress,
                ]);
                const actualLpOut = lpBalanceAfter.sub(lpBalanceBefore);
                const actualYtOut = ytBalanceAfter.sub(ytBalanceBefore);
                expect(actualLpOut).toEqBN(readerData.netLpOut, EPSILON_FOR_AGGREGATOR);
                expect(actualYtOut).toEqBN(readerData.netYtOut, EPSILON_FOR_AGGREGATOR);
                const tx = readerData.txReceipt;
                const gasPrice = tx.effectiveGasPrice;
                const gasUsed = tx.gasUsed;
                const gasUsedInEth = gasUsed.mul(gasPrice);
                // Todo: include gas check
                if (!isNativeToken(token)) {
                    expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAddAmount);
                } else {
                    expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAddAmount.add(gasUsedInEth));
                }
            }

            it('native token', async () => {
                await checkAddLiquiditySingleTokenKeepYt(NATIVE_ADDRESS_0xEE);
            });

            it('raw token', async () => {
                await checkAddLiquiditySingleTokenKeepYt(rawTokenAddress);
            });

            it('tokens in sy', async () => {
                const tokensIn = await sySdk.getTokensIn();
                for (const token of tokensIn) {
                    await checkAddLiquiditySingleTokenKeepYt(token);
                    await switchToZeroApproval();
                }
            });
        });

        it('#removeLiquidityDualSyAndPt', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                valueToTokenAmount(marketAddress, chainId)
            );

            if (liquidityRemove.eq(0)) {
                throw new Error('skip test because liquidityRemove is 0');
            }
            const [lpBalanceBefore, syBalanceBefore, ptBalanceBefore] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ptAddress,
            ]);

            const metaMethod = await router.removeLiquidityDualSyAndPt(
                currentConfig.marketAddress,
                liquidityRemove,
                SLIPPAGE_TYPE2,
                {
                    method: 'meta-method',
                }
            );

            const readerResult = await sendTxWithInfApproval(() => metaMethod, [marketAddress]);

            const [lpBalanceAfter, syBalanceAfter, ptBalanceAfter] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ptAddress,
            ]);

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);

            expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(readerResult.netSyOut, DEFAULT_EPSILON);
            expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerResult.netPtOut, DEFAULT_EPSILON);
        });

        it('#removeLiquidityDualTokenAndPt', async () => {
            const tokensOut = await sySdk.getTokensOut();
            for (const token of tokensOut) {
                const liquidityRemove = bnMinAsBn(
                    await getBalance(marketAddress, signerAddress),
                    valueToTokenAmount(marketAddress, chainId)
                );
                if (liquidityRemove.eq(0)) {
                    throw new Error(
                        `[${(await getERC20Name(token)) + ' ' + token}}] Skip test because liquidityRemove is 0`
                    );
                }
                const [lpBalanceBefore, tokenBalanceBefore, ptBalanceBefore] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                    ptAddress,
                ]);

                const readerResult = await sendTxWithInfApproval(
                    () =>
                        router.removeLiquidityDualTokenAndPt(
                            currentConfig.marketAddress,
                            liquidityRemove,
                            token,
                            SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                            }
                        ),
                    [marketAddress]
                );

                const [lpBalanceAfter, tokenBalanceAfter, ptBalanceAfter] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                    ptAddress,
                ]);

                // lp balance reduced amount equals to liquidity removed
                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);

                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                    (await readerResult.route.getNetOut())!,
                    EPSILON_FOR_AGGREGATOR
                );
                expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerResult.netPtOut, EPSILON_FOR_AGGREGATOR);

                await switchToZeroApproval();
            }
        });

        it('#removeLiquiditySinglePt', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                valueToTokenAmount(marketAddress, chainId)
            );
            if (liquidityRemove.eq(0)) {
                throw new Error('skip test because liquidityRemove is 0');
            }
            const [lpBalanceBefore, ptBalanceBefore] = await getUserBalances(signerAddress, [marketAddress, ptAddress]);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.removeLiquiditySinglePt(currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [marketAddress]
            );

            const [lpBalanceAfter, ptBalanceAfter] = await getUserBalances(signerAddress, [marketAddress, ptAddress]);

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);

            expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerData.netPtOut, DEFAULT_EPSILON);
        });

        it('#removeLiquiditySingleSy', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                valueToTokenAmount(marketAddress, chainId)
            );
            if (liquidityRemove.eq(0)) {
                throw new Error('skip test because liquidityRemove is 0');
            }
            const [lpBalanceBefore, syBalanceBefore] = await getUserBalances(signerAddress, [marketAddress, syAddress]);

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.removeLiquiditySingleSy(currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [marketAddress]
            );

            const [lpBalanceAfter, syBalanceAfter] = await getUserBalances(signerAddress, [marketAddress, syAddress]);
            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);

            expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(readerData.netSyOut, DEFAULT_EPSILON);
        });

        describeWrite('#removeLiquiditySingleToken', () => {
            async function checkRemoveLiquiditySingleToken(token: Address) {
                const liquidityRemove = bnMinAsBn(
                    await getBalance(marketAddress, signerAddress),
                    valueToTokenAmount(marketAddress, chainId)
                );
                if (liquidityRemove.eq(0)) {
                    throw new Error(
                        `[${(await getERC20Name(token)) + ' ' + token}}] Skip test because liquidityRemove is 0`
                    );
                }
                const [lpBalanceBefore, tokenBalanceBefore] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                ]);

                const readerData = await sendTxWithInfApproval(
                    () =>
                        router.removeLiquiditySingleToken(
                            currentConfig.marketAddress,
                            liquidityRemove,
                            token,
                            SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                            }
                        ),
                    [marketAddress]
                );

                const [lpBalanceAfter, tokenBalanceAfter] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                ]);
                // lp balance reduced amount equals to liquidity removed
                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);

                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                    (await readerData.route.getNetOut())!,
                    EPSILON_FOR_AGGREGATOR
                );
            }

            it('raw token', async () => {
                await checkRemoveLiquiditySingleToken(rawTokenAddress);
            });

            it('tokens out sy', async () => {
                const tokensOut = await sySdk.getTokensOut();
                for (const token of tokensOut) {
                    await checkRemoveLiquiditySingleToken(token);
                    await switchToZeroApproval();
                }
            });
        });
    });

    describeWrite('Type 1: swap between Sy and PT', () => {
        it('#swapExactPtForSy', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const ptInAmount = getPtSwapAmount(balanceBefore, true);
            if (ptInAmount.eq(0)) {
                throw new Error('skip test because ptInAmount is 0');
            }

            const readerResult = await sendTxWithInfApproval(
                () =>
                    router.swapExactPtForSy(currentConfig.marketAddress, ptInAmount, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ptAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            expect(balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance)).toEqBN(ptInAmount);
            expect(balanceAfter.syBalance.sub(balanceBefore.syBalance)).toEqBN(readerResult.netSyOut, DEFAULT_EPSILON);
        });

        it('#swapPtForExactSy', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectSyOut = getSySwapAmount(balanceBefore, false).div(100);
            if (expectSyOut.eq(0)) {
                throw new Error('skip test because expectSyOut is 0');
            }

            const callback = () =>
                router.swapPtForExactSy(currentConfig.marketAddress, expectSyOut, SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                });
            const skipTxCheck: SkipTxCheckCallback<typeof callback> = (readerData) =>
                readerData.netPtIn.gt(balanceBefore.ptBalance);

            const readerData = await sendTxWithInfApproval(callback, [ptAddress], skipTxCheck);
            if (skipTxCheck(readerData)) {
                throw new Error(
                    `skip test because netPtIn (${readerData.netPtIn.toString()}) > ptBalance (${balanceBefore.ptBalance.toString()})`
                );
            }

            const balanceAfter = await getSwapBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netPtIn = balanceBefore.ptBalance.sub(balanceAfter.ptBalance);
            expect(netPtIn).toEqBN(readerData.netPtIn, DEFAULT_EPSILON);

            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            verifyApproxOut(expectSyOut, netSyOut);
        });

        it('#swapSyForExactPt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectPtOut = getPtSwapAmount(balanceBefore, false);
            if (expectPtOut.eq(0)) {
                throw new Error('skip test because expectPtOut is 0');
            }

            const callback = () =>
                router.swapSyForExactPt(currentConfig.marketAddress, expectPtOut, SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                });
            const skipTxCheck: SkipTxCheckCallback<typeof callback> = (readerData) =>
                readerData.netSyIn.gt(balanceBefore.syBalance);

            const readerResult = await sendTxWithInfApproval(callback, [syAddress], skipTxCheck);

            if (skipTxCheck(readerResult)) {
                throw new Error(
                    `skip test because netSyIn (${readerResult.netSyIn.toString()}) > syBalance (${balanceBefore.syBalance.toString()})`
                );
            }

            const balanceAfter = await getSwapBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            // we know exactly how much PT we get out
            expect(netPtOut).toEqBN(expectPtOut);

            const netSyIn = balanceBefore.syBalance.sub(balanceAfter.syBalance);
            expect(netSyIn).toEqBN(readerResult.netSyIn, DEFAULT_EPSILON);
        });

        it('#swapExactSyForPt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectSyIn = getSySwapAmount(balanceBefore, true);
            if (expectSyIn.eq(0)) {
                throw new Error('skip test because expectSyIn is 0');
            }

            const readerResult = await sendTxWithInfApproval(
                () =>
                    router.swapExactSyForPt(currentConfig.marketAddress, expectSyIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netSyIn = balanceBefore.syBalance.sub(balanceAfter.syBalance);
            expect(netSyIn).toEqBN(expectSyIn);

            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            expect(netPtOut).toEqBN(readerResult.netPtOut, DEFAULT_EPSILON);
        });
    });

    describeWrite('Type 2: swap between Sy and YT', () => {
        it('#swapExactSyForYt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectSyIn = getSySwapAmount(balanceBefore, true);
            if (expectSyIn.eq(0)) {
                throw new Error('skip test because expectSyIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactSyForYt(currentConfig.marketAddress, expectSyIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            // Cannot use `verifyBalanceChanges` because the underlying logic of swapping YT/SY
            const netSyIn = balanceAfter.syBalance.sub(balanceBefore.syBalance).mul(-1);
            expect(netSyIn).toEqBN(expectSyIn);

            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toEqBN(readerData.netYtOut, DEFAULT_EPSILON);
        });

        it('#swapYtForExactSy', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            // Swap with YT involves approximation, so we divide the amount by 10
            // to avoid approx fail
            const expectSyOut = getSySwapAmount(balanceBefore, false).div(10);
            if (expectSyOut.eq(0)) {
                throw new Error('skip test because expectSyOut is 0');
            }

            const callback = () =>
                router.swapYtForExactSy(currentConfig.marketAddress, expectSyOut, SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                });
            const skipTxCheck: SkipTxCheckCallback<typeof callback> = (readerData) =>
                readerData.netYtIn.gt(balanceBefore.ytBalance);

            const readerData = await sendTxWithInfApproval(callback, [ytAddress], skipTxCheck);
            if (skipTxCheck(readerData)) {
                throw new Error(
                    `skip test because netYtIn (${readerData.netYtIn.toString()}) > ytBalance (${balanceBefore.ytBalance.toString()})`
                );
            }

            const balanceAfter = await getSwapBalanceSnapshot();
            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            verifyApproxOut(expectSyOut, netSyOut);

            const netYtIn = balanceBefore.ytBalance.sub(balanceAfter.ytBalance);
            expect(netYtIn).toEqBN(readerData.netYtIn, DEFAULT_EPSILON);
        });

        it('#swapSyForExactYt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectYtOut = getYtSwapAmount(balanceBefore, false);
            if (expectYtOut.eq(0)) {
                throw new Error('skip test because expectYtOut is 0');
            }

            const callback = () =>
                router.swapSyForExactYt(currentConfig.marketAddress, expectYtOut, SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                });
            const skipTxCheck: SkipTxCheckCallback<typeof callback> = (readerData) =>
                readerData.netSyIn.gt(balanceBefore.syBalance);

            const readerData = await sendTxWithInfApproval(callback, [syAddress], skipTxCheck);

            if (skipTxCheck(readerData)) {
                throw new Error(
                    `skip test because netSyIn (${readerData.netSyIn.toString()}) > syBalance (${balanceBefore.syBalance.toString()})`
                );
            }

            const balanceAfter = await getSwapBalanceSnapshot();
            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            verifyApproxOut(expectYtOut, netYtOut);

            const netSyIn = balanceBefore.syBalance.sub(balanceAfter.syBalance);
            expect(netSyIn).toEqBN(readerData.netSyIn, DEFAULT_EPSILON);
        });

        it('#swapExactYtForSy', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                throw new Error('skip test because expectYtIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactYtForSy(currentConfig.marketAddress, expectYtIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ytAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);

            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            expect(netSyOut).toEqBN(readerData.netSyOut, DEFAULT_EPSILON);
        });
    });

    describeWrite('Type 3: swap Token with PT & YT', () => {
        // TODO check swap from other raw tokens
        it('#swapExactTokenForPt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectRawTokenIn = getTokenSwapAmount(balanceBefore, true);
            if (expectRawTokenIn.eq(0)) {
                throw new Error('skip test because expectRawTokenIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactTokenForPt(
                        currentConfig.marketAddress,
                        rawTokenAddress,
                        expectRawTokenIn,
                        SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [rawTokenAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);

            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            expect(netPtOut).toEqBN(readerData.netPtOut, EPSILON_FOR_AGGREGATOR);
        });

        it('#swapExactPtForToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore, true);
            if (expectPtIn.eq(0)) {
                throw new Error('skip test because expectPtIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactPtForToken(
                        currentConfig.marketAddress,
                        expectPtIn,
                        rawTokenAddress,
                        SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [ptAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);
            expect(netPtIn).toEqBN(expectPtIn);

            const netRawTokenOut = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance);
            expect(netRawTokenOut).toEqBN((await readerData.route.getNetOut())!, EPSILON_FOR_AGGREGATOR);
        });

        it('#swapExactTokenForYt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectRawTokenIn = getTokenSwapAmount(balanceBefore, true);
            if (expectRawTokenIn.eq(0)) {
                throw new Error('skip test because expectRawTokenIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactTokenForYt(
                        currentConfig.marketAddress,
                        rawTokenAddress,
                        expectRawTokenIn,
                        SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [rawTokenAddress]
            );
            const balanceAfter = await getSwapBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);

            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toEqBN(readerData.netYtOut, EPSILON_FOR_AGGREGATOR);
        });

        it('#swapExactYtForToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                throw new Error('skip test because expectYtIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactYtForToken(
                        currentConfig.marketAddress,
                        expectYtIn,
                        rawTokenAddress,
                        SLIPPAGE_TYPE2,
                        {
                            method: 'meta-method',
                        }
                    ),
                [ytAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);

            const netRawTokenOut = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance);
            expect(netRawTokenOut).toEqBN((await readerData.route.getNetOut())!, DEFAULT_EPSILON);
        });
    });

    /*
     * Type 4: Mint, redeem PY & SY -> Token
     */
    describeWrite('Type 4: mint, redeem PY & SY -> Token', () => {
        it('#mintPyFromToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectRawTokenIn = bnMinAsBn(
                valueToTokenAmount(rawTokenAddress, chainId),
                balanceBefore.tokenBalance
            );
            if (expectRawTokenIn.eq(0)) {
                throw new Error('skip test because expectRawTokenIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.mintPyFromToken(currentConfig.market.YT, rawTokenAddress, expectRawTokenIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [rawTokenAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);

            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netPtOut).toEqBN(netYtOut);
            expect(netPtOut).toEqBN(readerData.netPyOut, EPSILON_FOR_AGGREGATOR);
        });

        it('#redeemPyToToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectPyIn = getPyRedeemAmount(balanceBefore);
            if (expectPyIn.eq(0)) {
                throw new Error('skip test because expectPyIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.redeemPyToToken(currentConfig.market.YT, expectPyIn, rawTokenAddress, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ptAddress, ytAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);

            expect(netYtIn).toEqBN(expectPyIn);
            expect(netPtIn).toEqBN(expectPyIn);

            const netTokenOut = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance);
            expect(netTokenOut).toEqBN((await readerData.route.getNetOut())!, EPSILON_FOR_AGGREGATOR);
        });

        it('#mintSyFromToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectRawTokenIn = bnMinAsBn(
                valueToTokenAmount(rawTokenAddress, chainId),
                balanceBefore.tokenBalance
            );
            if (expectRawTokenIn.eq(0)) {
                throw new Error('skip test because expectRawTokenIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.mintSyFromToken(currentConfig.market.SY, rawTokenAddress, expectRawTokenIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [rawTokenAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);

            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            expect(netSyOut).toEqBN(readerData.netSyOut, EPSILON_FOR_AGGREGATOR);
        });

        it('#redeemSyToToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectSyIn = getSyRedeemAmount(balanceBefore);
            if (expectSyIn.eq(0)) {
                throw new Error('skip test because expectSyIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.redeemSyToToken(currentConfig.market.SY, expectSyIn, rawTokenAddress, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [syAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netSyIn = balanceAfter.syBalance.sub(balanceBefore.syBalance).mul(-1);
            expect(netSyIn).toEqBN(expectSyIn);

            const netRawTokenOut = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance);
            expect(netRawTokenOut).toEqBN((await readerData.route.getNetOut())!, EPSILON_FOR_AGGREGATOR);
        });
    });

    describeWrite('Type 5: YT <-> PT', () => {
        it('#swapExactYtForPt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                throw new Error('skip test because expectYtIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactYtForPt(currentConfig.marketAddress, expectYtIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ytAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netYtIn = balanceBefore.ytBalance.sub(balanceAfter.ytBalance);
            expect(netYtIn).toEqBN(expectYtIn);

            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            expect(netPtOut).toEqBN(readerData.netPtOut, DEFAULT_EPSILON);
        });

        it('#swapExactPtForYt', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore, true);
            if (expectPtIn.eq(0)) {
                throw new Error('skip test because expectPtIn is 0');
            }

            const readerData = await sendTxWithInfApproval(
                () =>
                    router.swapExactPtForYt(currentConfig.marketAddress, expectPtIn, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [ptAddress]
            );

            const balanceAfter = await getSwapBalanceSnapshot();
            const netPtIn = balanceBefore.ptBalance.sub(balanceAfter.ptBalance);
            expect(netPtIn).toEqBN(expectPtIn);

            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toEqBN(readerData.netYtOut, DEFAULT_EPSILON);
        });
    });

    describeWrite('Bundler', () => {
        it('#mintPyFromSy and redeem market reward', async () => {
            const bundler = router.createTransactionBundler();
            const rewardTokens = await marketEntity.getRewardTokens();
            const rewardBalancesBefore = await getUserBalances(signerAddress, rewardTokens);
            const syBalanceBefore = await getBalance(syAddress, signerAddress);
            const mintSyAmount = valueToTokenAmount(syAddress, chainId);
            await approveInfHelper(syAddress, router.address);
            await marketEntity.transfer(NATIVE_ADDRESS_0xEE, '0');

            bundler
                .addContractMetaMethod(
                    await router.mintPyFromSy(currentConfig.market.YT, mintSyAmount, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    })
                )
                .addContractMetaMethod(
                    await router.redeemDueInterestAndRewards(
                        {
                            markets: [currentConfig.marketAddress],
                        },
                        {
                            method: 'meta-method',
                        }
                    )
                );

            const metaMethod = await bundler.execute({ method: 'meta-method' });
            const callStaticData = await metaMethod.callStatic();
            for (const { success } of callStaticData) {
                expect(success).toBeTruthy();
                // TODO: check return data?
            }

            await metaMethod.send();

            const syBalanceAfter = await getBalance(syAddress, signerAddress);
            expect(syBalanceAfter).toEqBN(syBalanceBefore.sub(mintSyAmount));

            const rewardBalancesAfter = await getUserBalances(signerAddress, rewardTokens);
            expect(rewardBalancesAfter.some((balance, i) => balance.gt(rewardBalancesBefore[i]))).toBeTruthy();
        });
    });

    describeWrite('migrate liquidity', () => {
        function findMarketsWithSameSy() {
            const markets = currentConfig.markets;
            const syAddresses = markets.map((x) => toAddress(x.SY));
            for (let i = 0; i < markets.length; i++) {
                for (let j = i + 1; j < markets.length; j++) {
                    if (areSameAddresses(syAddresses[i], syAddresses[j])) {
                        return [markets[i], markets[j]];
                    }
                }
            }
            throw new Error('no markets with same sy');
        }

        function findMarketsWithDifferentSy() {
            const markets = currentConfig.markets;
            const syAddresses = markets.map((x) => toAddress(x.SY));
            for (let i = 0; i < markets.length; i++) {
                // for down to find latest market
                for (let j = markets.length - 1; j > i; j--) {
                    if (!areSameAddresses(syAddresses[i], syAddresses[j])) {
                        return [markets[i], markets[j]];
                    }
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
        const testData = Object.entries(tests).filter(([_name, data]) => {
            try {
                data.getMarkets();
                return true;
            } catch {
                return false;
            }
        });

        it.each(testData)('%s', async (_, { getMarkets, sameSy, keepYt, redeemRewards }) => {
            const [srcMarket, dstMarket] = getMarkets();
            const [srcMarketAddress, dstMarketAddress] = [srcMarket.market, dstMarket.market];
            const rewardTokens = await getRewardTokens(srcMarket);
            await setPendleERC20Balance(srcMarketAddress, signerAddress, decimalFactor(18));
            // ping the transfer to update the market rewards
            await transferHelper(srcMarketAddress, NATIVE_ADDRESS_0xEE, BN.from(0));

            const balanceBefore = await getUserBalances(signerAddress, [
                srcMarketAddress,
                dstMarketAddress,
                dstMarket.YT,
            ]);
            const lpToRemoveAmount = bnMinAsBn(decimalFactor(18), balanceBefore[0]);
            const rewardBalancesBefore = await getUserBalances(signerAddress, rewardTokens);
            await approveInfHelper(srcMarketAddress, router.getRouterHelper().address);
            await approveInfHelper(srcMarketAddress, router.address);

            const getMetaCall = async () => {
                if (sameSy) {
                    if (keepYt) {
                        return router.migrateLiquidityViaSharedSyKeepYt(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            SLIPPAGE_TYPE2,
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
                            SLIPPAGE_TYPE2,
                            {
                                method: 'meta-method',
                                redeemRewards,
                            }
                        );
                    }
                } else {
                    const syEntity = new SyEntity(srcMarket.SY, networkConnectionWithChainId);
                    const tokensOut = await syEntity.getTokensOut();
                    const preferredTokens = [currentConfig.tokens.USDC, currentConfig.tokens.WETH];
                    const tokenRedeemSy = tokensOut.find((x) => preferredTokens.includes(x)) ?? tokensOut[0];
                    if (keepYt) {
                        return router.migrateLiquidityViaTokenRedeemSyKeepYt(
                            srcMarketAddress,
                            lpToRemoveAmount,
                            dstMarketAddress,
                            tokenRedeemSy,
                            SLIPPAGE_TYPE2,
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
                            SLIPPAGE_TYPE2,
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
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const readerData = metaCall.data;
            const balanceAfter = await getUserBalances(signerAddress, [
                srcMarketAddress,
                dstMarketAddress,
                dstMarket.YT,
            ]);
            const addLiquidityMetaMethod =
                'addLiquidityRoute' in readerData
                    ? await readerData.addLiquidityRoute.buildCall()
                    : readerData.addLiquidityMetaMethod;

            expect(balanceBefore[0].sub(balanceAfter[0])).toEqBN(lpToRemoveAmount);
            expect(balanceAfter[1].sub(balanceBefore[1])).toEqBN(
                addLiquidityMetaMethod.data.netLpOut,
                EPSILON_FOR_AGGREGATOR
            );

            if (keepYt) {
                const netYtOut =
                    'netYtOut' in addLiquidityMetaMethod.data ? addLiquidityMetaMethod.data.netYtOut : BN.from(-1);
                expect(balanceAfter[2].sub(balanceBefore[2])).toEqBN(netYtOut, EPSILON_FOR_AGGREGATOR);
            } else {
                expect(balanceAfter[2].sub(balanceBefore[2])).toEqBN(0);
            }

            const rewardBalancesAfter = await getUserBalances(signerAddress, rewardTokens);
            if (redeemRewards) {
                expect(rewardBalancesAfter.some((balance, i) => balance.gt(rewardBalancesBefore[i]))).toBeTruthy();
            } else {
                expect(rewardBalancesAfter.every((balance, i) => balance.eq(rewardBalancesBefore[i]))).toBeTruthy();
            }

            // const callData = await metaCall.extractParams();
            // console.log(callData);
        });
    });

    it.skip('#sellSys', async () => {
        const sys = currentConfig.markets.map((x) => toAddress(x.SY));
        const syDecimals = await Promise.all(sys.map((x) => getERC20Decimals(x)));

        // convert 1 sy
        const netSyIns = syDecimals.map((x) => decimalFactor(x));
        const receiver = toAddress(currentConfig.userAddress);

        const results = await router.sellSys(
            currentConfig.tokens.USDC,
            SLIPPAGE_TYPE2,
            { sys, netSyIns },
            { receiver }
        );
        const simplifiedResults = results.map((x) => ({
            kyberRouter: x.swapData.extRouter,
            tokenRedeemSy: x.tokenRedeemSy,
            minTokenOut: x.minTokenOut.toString(),
            bulk: x.bulk,
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

    // =============================HELPER FUNCTIONS====================================================
    async function getRewardTokens(market: { SY: Address }): Promise<Address[]> {
        const syEntity = new SyEntity(market.SY, networkConnectionWithChainId);
        const rewardTokens = await syEntity.getRewardTokens();
        return [...rewardTokens, getContractAddresses(ACTIVE_CHAIN_ID).PENDLE].map(toAddress);
    }

    /**
     * Helper function to get balance snapshot of the market
     */
    async function getSwapBalanceSnapshot(): Promise<BalanceSnapshot> {
        const [ptBalance, syBalance, ytBalance, tokenBalance, marketPtBalance, marketSyBalance] = await Promise.all([
            getBalance(ptAddress, signerAddress),
            getBalance(syAddress, signerAddress),
            getBalance(ytAddress, signerAddress),
            getBalance(rawTokenAddress, signerAddress),
            getBalance(ptAddress, currentConfig.marketAddress),
            getBalance(syAddress, currentConfig.marketAddress),
        ]);
        return {
            ptBalance,
            syBalance,
            ytBalance,
            tokenBalance,
            marketPtBalance,
            marketSyBalance,
        };
    }

    function getSySwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean): BN {
        const marketAmount = balanceSnapshot.marketSyBalance.div(MARKET_SWAP_FACTOR);
        const userAmount = balanceSnapshot.syBalance;

        const amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, valueToTokenAmount(syAddress, chainId));
    }

    function getPtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        const marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        const userAmount = balanceSnapshot.ptBalance;

        const amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, valueToTokenAmount(ptAddress, chainId));
    }

    function getYtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        // `pt` is not a typo here
        const marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        const userAmount = balanceSnapshot.ytBalance;

        const amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, valueToTokenAmount(ytAddress, chainId));
    }

    /**
     * Get a safe amount of token to swap through router.
     *
     * Ideally, this function should calculate the swap amount
     * base on the balanceSnapshot.
     *
     * TODO: Fix this?
     */
    function getTokenSwapAmount(balanceSnapshot: BalanceSnapshot, _getIn: boolean) {
        return bnMinAsBn(valueToTokenAmount(rawTokenAddress, chainId), balanceSnapshot.tokenBalance);
    }

    function getPyRedeemAmount(balanceSnapshot: BalanceSnapshot) {
        return bnMinAsBn(balanceSnapshot.ptBalance, balanceSnapshot.ytBalance).div(REDEEM_FACTOR);
    }

    function getSyRedeemAmount(balanceSnapshot: BalanceSnapshot) {
        return balanceSnapshot.syBalance.div(REDEEM_FACTOR);
    }

    function verifyBalanceChanges(balanceBefore: BalanceSnapshot, balanceAfter: BalanceSnapshot) {
        const ptBalanceDiff = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
        const marketPtBalanceDiff = balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance);
        expect(ptBalanceDiff).toEqBN(marketPtBalanceDiff.mul(-1));

        const syBalanceDiff = balanceAfter.syBalance.sub(balanceBefore.syBalance);
        const marketSyBalanceDiff = balanceAfter.marketSyBalance.sub(balanceBefore.marketSyBalance);
        expect(syBalanceDiff).toBeLteBN(marketSyBalanceDiff.mul(-1));
    }

    function verifyApproxOut(expectSyOut: BN, netSyOut: BN) {
        // netSyOut will differ from expectSyOut by 0.1%
        expect(netSyOut).toBeGteBN(expectSyOut);
        // netSyOut <= expectSyOut * 100.1%

        // Add 10_000 in case the expect SyOut is too small
        expect(netSyOut).toBeLteBN(expectSyOut.add(expectSyOut.div(1000)).add(10_000));
    }
});
