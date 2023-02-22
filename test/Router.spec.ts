import { decimalFactor, MetaMethodReturnType, Router, SyEntity, MetaMethodData, Address, toAddress } from '../src';
import { currentConfig, describeWrite, networkConnectionWithChainId, BLOCK_CONFIRMATION, signer } from './util/testEnv';
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
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import { IPAllAction } from '@pendle/core-v2/typechain-types';
import {
    DEFAULT_EPSILON,
    REDEEM_FACTOR,
    SLIPPAGE_TYPE2,
    DEFAULT_SWAP_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    MARKET_SWAP_FACTOR,
    MAX_REMOVE_LIQUIDITY_AMOUNT,
    MAX_SY_SWAP_AMOUNT,
    MAX_PT_SWAP_AMOUNT,
    MAX_YT_SWAP_AMOUNT,
    MAX_PT_ADD_AMOUNT,
    MAX_TOKEN_ADD_AMOUNT,
    MAX_SY_ADD_AMOUNT,
    BALANCE_OF_STORAGE_SLOT,
} from './util/constants';

type BalanceSnapshot = {
    ptBalance: BN;
    syBalance: BN;
    ytBalance: BN;
    tokenBalance: BN;
    marketPtBalance: BN;
    marketSyBalance: BN;
};

type MetaMethodCallback = () => MetaMethodReturnType<'meta-method', IPAllAction, any, any>;
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

    let syDecimals: number;
    let ptDecimals: number;
    let ytDecimals: number;
    let lpDecimals: number;
    let rawTokenDecimals: number;

    let zeroApprovalSnapshotId = '';

    beforeAll(async () => {
        // prepare balances
        const balance = BN.from(10).pow(18).mul(1_000);
        const tokens = [syAddress, ptAddress, ytAddress, marketAddress];
        await Promise.all(tokens.map((token) => setPendleERC20Balance(token, signerAddress, balance)));
        await increaseNativeBalance(signerAddress);

        const tokensIn = [...(await sySdk.getTokensIn()), rawTokenAddress];
        for (const token of tokensIn) {
            const slotInfo = BALANCE_OF_STORAGE_SLOT[token];
            if (!slotInfo) {
                console.log(`No balanceOf slot info for ${await getERC20Name(token)} ${token}`);
                continue;
            }
            setERC20Balance(token, signerAddress, balance, ...slotInfo);
        }

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

        [syDecimals, ptDecimals, ytDecimals, lpDecimals, rawTokenDecimals] = await Promise.all([
            getERC20Decimals(syAddress),
            getERC20Decimals(ptAddress),
            getERC20Decimals(ytAddress),
            getERC20Decimals(marketAddress),
            getERC20Decimals(rawTokenAddress),
        ]);
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
        }
    }

    async function sendTxWithInfApproval<T extends MetaMethodCallback>(
        callback: T,
        tokens: Address[],
        skipTxCheck?: SkipTxCheckCallback<T>
    ): Promise<MetaMethodData<T>> {
        const metaCall = await callback();

        if (skipTxCheck && skipTxCheck(metaCall.data)) {
            return metaCall.data;
        }

        await batchInfApprove(tokens);
        await metaCall
            .connect(signer)
            .send()
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        return metaCall.data;
    }

    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite('Overall write functions', () => {
        it('#addLiquidityDualSyAndPt', async () => {
            const syAdd = bnMinAsBn(
                decimalFactor(syDecimals).mul(MAX_SY_ADD_AMOUNT),
                await getBalance(syAddress, signerAddress)
            );
            const ptAdd = bnMinAsBn(
                decimalFactor(ptDecimals).mul(MAX_PT_ADD_AMOUNT),
                await getBalance(ptAddress, signerAddress)
            );

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
            let tokensIn = await sySdk.getTokensIn();
            for (let token of tokensIn) {
                const tokenDecimals = await getERC20Decimals(token);
                const tokenAddAmount = bnMinAsBn(
                    // Use small amount of token to make sure we will add all of them
                    // TODO: use actual logic to calculate the amount to add
                    decimalFactor(tokenDecimals),
                    await getBalance(token, signerAddress)
                );
                const ptAdd = bnMinAsBn(
                    decimalFactor(ptDecimals).mul(MAX_PT_ADD_AMOUNT),
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
                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
                // for some technical reasons, we need to test all tokens inside a single test
                // so we need to revert manually instead of `afterEach`
                await switchToZeroApproval();
            }
        });

        it('#addLiquiditySinglePt', async () => {
            const ptAdd = bnMinAsBn(
                decimalFactor(ptDecimals).mul(MAX_PT_ADD_AMOUNT),
                await getBalance(ptAddress, signerAddress)
            );
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
            expect(ptBalanceBefore.sub(ptBalanceAfter)).toEqBN(ptAdd, DEFAULT_EPSILON);
        });

        it('#addLiquiditySingleSy', async () => {
            const syAdd = bnMinAsBn(
                decimalFactor(syDecimals).mul(MAX_SY_ADD_AMOUNT),
                await getBalance(syAddress, signerAddress)
            );
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
            expect(syBalanceBefore.sub(syBalanceAfter)).toEqBN(syAdd, DEFAULT_EPSILON);
        });

        describeWrite('#addLiquiditySingleToken', () => {
            async function checkAddLiquiditySingleToken(token: Address) {
                const tokenDecimals = await getERC20Decimals(token);
                const tokenAddAmount = bnMinAsBn(
                    decimalFactor(tokenDecimals).mul(MAX_TOKEN_ADD_AMOUNT),
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

                const [lpBalanceAfter, tokenBalanceAfter] = await getUserBalances(signerAddress, [
                    marketAddress,
                    token,
                ]);
                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(readerData.netLpOut, DEFAULT_EPSILON);
                expect(tokenBalanceBefore.sub(tokenBalanceAfter)).toEqBN(tokenAddAmount, DEFAULT_EPSILON);
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

        it('#removeLiquidityDualSyAndPt', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                decimalFactor(lpDecimals).mul(MAX_REMOVE_LIQUIDITY_AMOUNT)
            );

            if (liquidityRemove.eq(0)) {
                throw new Error('skip test because liquidityRemove is 0');
            }
            const [lpBalanceBefore, syBalanceBefore, ptBalanceBefore] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ptAddress,
            ]);

            const readerResult = await sendTxWithInfApproval(
                () =>
                    router.removeLiquidityDualSyAndPt(currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2, {
                        method: 'meta-method',
                    }),
                [marketAddress]
            );

            const [lpBalanceAfter, syBalanceAfter, ptBalanceAfter] = await getUserBalances(signerAddress, [
                marketAddress,
                syAddress,
                ptAddress,
            ]);

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove, DEFAULT_EPSILON);

            expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(readerResult.netSyOut, DEFAULT_EPSILON);
            expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerResult.netPtOut, DEFAULT_EPSILON);
        });

        it('#removeLiquidityDualTokenAndPt', async () => {
            let tokensOut = await sySdk.getTokensOut();
            for (let token of tokensOut) {
                const liquidityRemove = bnMinAsBn(
                    await getBalance(marketAddress, signerAddress),
                    decimalFactor(lpDecimals).mul(MAX_REMOVE_LIQUIDITY_AMOUNT)
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
                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove, DEFAULT_EPSILON);

                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                    (await readerResult.route.getNetOut())!,
                    DEFAULT_EPSILON
                );
                expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerResult.netPtOut, DEFAULT_EPSILON);

                await switchToZeroApproval();
            }
        });

        it('#removeLiquiditySinglePt', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                decimalFactor(lpDecimals).mul(MAX_REMOVE_LIQUIDITY_AMOUNT)
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
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove, DEFAULT_EPSILON);

            expect(ptBalanceAfter.sub(ptBalanceBefore)).toEqBN(readerData.netPtOut, DEFAULT_EPSILON);
        });

        it('#removeLiquiditySingleSy', async () => {
            const liquidityRemove = bnMinAsBn(
                await getBalance(marketAddress, signerAddress),
                decimalFactor(lpDecimals).mul(MAX_REMOVE_LIQUIDITY_AMOUNT)
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
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove, DEFAULT_EPSILON);

            expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(readerData.netSyOut, DEFAULT_EPSILON);
        });

        describeWrite('#removeLiquiditySingleToken', () => {
            async function checkRemoveLiquiditySingleToken(token: Address) {
                const liquidityRemove = bnMinAsBn(
                    await getBalance(marketAddress, signerAddress),
                    decimalFactor(lpDecimals).mul(MAX_REMOVE_LIQUIDITY_AMOUNT)
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
                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove, DEFAULT_EPSILON);

                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(
                    (await readerData.route.getNetOut())!,
                    DEFAULT_EPSILON
                );
            }

            it('raw token', async () => {
                await checkRemoveLiquiditySingleToken(rawTokenAddress);
            });

            it('tokens out sy', async () => {
                const tokensOut = await sySdk.getTokensOut();
                for (let token of tokensOut) {
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
                    `skip test because netPtIn (${readerData.netPtIn}) > ptBalance (${balanceBefore.ptBalance})`
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
                    `skip test because netSyIn (${readerResult.netSyIn}) > syBalance (${balanceBefore.syBalance})`
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
                    `skip test because netYtIn (${readerData.netYtIn}) > ytBalance (${balanceBefore.ytBalance})`
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
                    `skip test because netSyIn (${readerData.netSyIn}) > syBalance (${balanceBefore.syBalance})`
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
            expect(netPtOut).toEqBN(readerData.netPtOut, DEFAULT_EPSILON);
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
            expect(netRawTokenOut).toEqBN((await readerData.route.getNetOut())!, DEFAULT_EPSILON);
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
            expect(netYtOut).toEqBN(readerData.netYtOut, DEFAULT_EPSILON);
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
                decimalFactor(rawTokenDecimals).mul(DEFAULT_MINT_AMOUNT),
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
            expect(netPtOut).toEqBN(readerData.netPyOut, DEFAULT_EPSILON);
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
            expect(netTokenOut).toEqBN((await readerData.route.getNetOut())!, DEFAULT_EPSILON);
        });

        it('#mintSyFromToken', async () => {
            const balanceBefore = await getSwapBalanceSnapshot();
            const expectRawTokenIn = bnMinAsBn(
                decimalFactor(rawTokenDecimals).mul(DEFAULT_MINT_AMOUNT),
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
            expect(netSyOut).toEqBN(readerData.netSyOut, DEFAULT_EPSILON);
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
            expect(netRawTokenOut).toEqBN((await readerData.route.getNetOut())!, DEFAULT_EPSILON);
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
        let marketAmount = balanceSnapshot.marketSyBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.syBalance;

        let amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, decimalFactor(syDecimals).mul(MAX_SY_SWAP_AMOUNT));
    }

    function getPtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ptBalance;

        let amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, decimalFactor(ptDecimals).mul(MAX_PT_SWAP_AMOUNT));
    }

    function getYtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        // `pt` is not a typo here
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ytBalance;

        let amount = getIn ? bnMinAsBn(marketAmount, userAmount) : marketAmount;

        return bnMinAsBn(amount, decimalFactor(ytDecimals).mul(MAX_YT_SWAP_AMOUNT));
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
        return bnMinAsBn(decimalFactor(rawTokenDecimals).mul(DEFAULT_SWAP_AMOUNT), balanceSnapshot.tokenBalance);
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
