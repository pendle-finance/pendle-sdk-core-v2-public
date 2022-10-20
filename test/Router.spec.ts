import { Router, SyEntity } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testUtils';
import {
    getBalance,
    REDEEM_FACTOR,
    SLIPPAGE_TYPE2,
    getTotalSupply,
    REMOVE_LIQUIDITY_FACTOR_ZAP,
    DEFAULT_SWAP_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    minBigNumber,
    MARKET_SWAP_FACTOR,
    USER_BALANCE_FACTOR,
    getERC20Name,
    REMOVE_LIQUIDITY_FACTOR,
    MAX_SY_SWAP_AMOUNT,
    MAX_PT_SWAP_AMOUNT,
    MAX_YT_SWAP_AMOUNT,
    MAX_PT_ADD_AMOUNT,
    MAX_TOKEN_ADD_AMOUNT,
    MAX_SY_ADD_AMOUNT,
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import './util/bigNumberMatcher';
import { getRouterStatic } from '../src/entities/helper';
import { ApproximateError, NoRouteFoundError } from '../src/errors';

type BalanceSnapshot = {
    ptBalance: BN;
    syBalance: BN;
    ytBalance: BN;
    tokenBalance: BN;
    marketPtBalance: BN;
    marketSyBalance: BN;
};

type LpBalanceSnapshot = {
    lpBalance: BN;
    lpTotalSupply: BN;
};

describe(Router, () => {
    const router = Router.getRouter(networkConnection, ACTIVE_CHAIN_ID);
    const routerStatic = getRouterStatic(networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const marketAddress = currentConfig.market.market;
    const syAddress = currentConfig.market.SY;
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;
    const sySdk = new SyEntity(syAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite('Overall write functions', () => {
        it('#addLiquidityDualSyAndPt', async () => {
            const syAdd = minBigNumber(
                MAX_SY_ADD_AMOUNT,
                (await getBalance(syAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );
            const ptAdd = minBigNumber(
                MAX_PT_ADD_AMOUNT,
                (await getBalance(ptAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );

            if (syAdd.eq(0) || ptAdd.eq(0)) {
                console.warn('skip test because syAdd or ptAdd is 0');
                return;
            }

            const lpBalanceBefore = await getBalance(marketAddress, signer.address);
            const marketSupplyBefore = await getTotalSupply(marketAddress);

            await router
                .addLiquidityDualSyAndPt(signer.address, currentConfig.marketAddress, syAdd, ptAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const lpBalanceAfter = await getBalance(marketAddress, signer.address);
            const marketSupplyAfter = await getTotalSupply(marketAddress);

            expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
            expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
        });

        it('#addLiquidityDualTokenAndPt', async () => {
            // TODO: add liquidity from other raw tokens
            let tokensIn = await sySdk.contract.getTokensIn();
            for (let token of tokensIn) {
                const tokenAddAmount = minBigNumber(
                    MAX_TOKEN_ADD_AMOUNT,
                    (await getBalance(token, signer.address)).div(USER_BALANCE_FACTOR)
                );
                const ptAdd = minBigNumber(
                    MAX_PT_ADD_AMOUNT,
                    (await getBalance(ptAddress, signer.address)).div(USER_BALANCE_FACTOR)
                );

                if (tokenAddAmount.eq(0) || ptAdd.eq(0)) {
                    console.warn(`[${await getERC20Name(token)}] Skip test because tokenAddAmount or ptAdd is 0`);
                    continue;
                }

                const lpBalanceBefore = await getBalance(marketAddress, signer.address);
                const marketSupplyBefore = await getTotalSupply(marketAddress);

                let flag = false;
                await router
                    .addLiquidityDualTokenAndPt(
                        signer.address,
                        currentConfig.marketAddress,
                        token,
                        tokenAddAmount,
                        ptAdd,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                if (flag) continue;

                const lpBalanceAfter = await getBalance(marketAddress, signer.address);
                const marketSupplyAfter = await getTotalSupply(marketAddress);

                expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
                expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
            }
        });

        it('#addLiquiditySinglePt', async () => {
            const ptAdd = minBigNumber(
                MAX_PT_ADD_AMOUNT,
                (await getBalance(ptAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );
            if (ptAdd.eq(0)) {
                console.warn('skip test because ptAdd is 0');
                return;
            }
            const balanceBefore = await getLpBalanceSnapshot();

            let flag = false;
            await router
                .addLiquiditySinglePt(signer.address, currentConfig.marketAddress, ptAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getLpBalanceSnapshot();
            verifyLpBalanceChanges(balanceBefore, balanceAfter);
        });

        it('#addLiquiditySingleSy', async () => {
            const syAdd = minBigNumber(
                MAX_SY_ADD_AMOUNT,
                (await getBalance(syAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );
            if (syAdd.eq(0)) {
                console.warn('skip test because syAdd is 0');
                return;
            }
            const balanceBefore = await getLpBalanceSnapshot();

            let flag = false;
            await router
                .addLiquiditySingleSy(signer.address, currentConfig.marketAddress, syAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getLpBalanceSnapshot();
            verifyLpBalanceChanges(balanceBefore, balanceAfter);
        });

        it('#addLiquiditySingleToken', async () => {
            // TODO: zap from other raw tokens
            let tokensIn = await sySdk.contract.getTokensIn();
            for (let token of tokensIn) {
                const tokenAddAmount = minBigNumber(
                    MAX_TOKEN_ADD_AMOUNT,
                    (await getBalance(token, signer.address)).div(USER_BALANCE_FACTOR)
                );

                if (tokenAddAmount.eq(0)) {
                    console.warn(`[${await getERC20Name(token)}] Skip test because tokenAddAmount is 0`);
                    continue;
                }
                const balanceBefore = await getLpBalanceSnapshot();

                let flag = false;
                await router
                    .addLiquiditySingleToken(
                        signer.address,
                        currentConfig.marketAddress,
                        token,
                        tokenAddAmount,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                    .catch((e) => {
                        // e = EthersJsError.handleEthersJsError(e);
                        if (e instanceof NoRouteFoundError || e instanceof ApproximateError) {
                            flag = true;
                            console.warn(e.message);
                            return;
                        }
                        throw e;
                    });

                if (flag) continue;

                const balanceAfter = await getLpBalanceSnapshot();
                verifyLpBalanceChanges(balanceBefore, balanceAfter);
            }
        });

        it('#removeLiquidityDualSyAndPt', async () => {
            const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(REMOVE_LIQUIDITY_FACTOR);

            if (liquidityRemove.eq(0)) {
                console.warn('skip test because liquidityRemove is 0');
                return;
            }
            const lpBalanceBefore = await getBalance(marketAddress, signer.address);
            const marketSupplyBefore = await getTotalSupply(marketAddress);

            await router
                .removeLiquidityDualSyAndPt(
                    signer.address,
                    currentConfig.marketAddress,
                    liquidityRemove,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const lpBalanceAfter = await getBalance(marketAddress, signer.address);
            const marketSupplyAfter = await getTotalSupply(marketAddress);

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);
            expect(marketSupplyBefore.sub(marketSupplyAfter)).toEqBN(liquidityRemove);
        });

        it('#removeLiquidityDualTokenAndPt', async () => {
            // TODO: remove liquidity to other raw tokens
            let tokensIn = await sySdk.contract.getTokensIn();
            for (let token of tokensIn) {
                const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(
                    REMOVE_LIQUIDITY_FACTOR_ZAP
                );
                if (liquidityRemove.eq(0)) {
                    console.warn(`[${await getERC20Name(token)}] Skip test because liquidityRemove is 0`);
                    return; // return here since the liquidity will not changed in this for loop
                }
                const lpBalanceBefore = await getBalance(marketAddress, signer.address);
                const marketSupplyBefore = await getTotalSupply(marketAddress);

                let flag = false;
                await router
                    .removeLiquidityDualTokenAndPt(
                        signer.address,
                        currentConfig.marketAddress,
                        liquidityRemove,
                        token,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                if (flag) continue;

                const lpBalanceAfter = await getBalance(marketAddress, signer.address);
                const marketSupplyAfter = await getTotalSupply(marketAddress);

                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);
                expect(marketSupplyBefore.sub(marketSupplyAfter)).toEqBN(liquidityRemove);
            }
        });

        it('#removeLiquiditySinglePt', async () => {
            const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(REMOVE_LIQUIDITY_FACTOR_ZAP);
            if (liquidityRemove.eq(0)) {
                console.warn('skip test because liquidityRemove is 0');
                return;
            }
            const balanceBefore = await getLpBalanceSnapshot();

            let flag = false;
            await router
                .removeLiquiditySinglePt(signer.address, currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getLpBalanceSnapshot();

            verifyLpBalanceChanges(balanceBefore, balanceAfter);
            // lp balance reduced amount equals to liquidity removed
            expect(balanceBefore.lpBalance.sub(balanceAfter.lpBalance)).toEqBN(liquidityRemove);
        });

        it('#removeLiquiditySingleSy', async () => {
            const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(REMOVE_LIQUIDITY_FACTOR_ZAP);
            if (liquidityRemove.eq(0)) {
                console.warn('skip test because liquidityRemove is 0');
            }
            const balanceBefore = await getLpBalanceSnapshot();

            await router
                .removeLiquiditySingleSy(signer.address, currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getLpBalanceSnapshot();

            verifyLpBalanceChanges(balanceBefore, balanceAfter);
            // lp balance reduced amount equals to liquidity removed
            expect(balanceBefore.lpBalance.sub(balanceAfter.lpBalance)).toEqBN(liquidityRemove);
        });

        it('#removeLiquiditySingleToken', async () => {
            // TODO: remove liquidity to other raw tokens
            let tokensIn = await sySdk.contract.getTokensIn();
            for (let token of tokensIn) {
                const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(
                    REMOVE_LIQUIDITY_FACTOR_ZAP
                );
                if (liquidityRemove.eq(0)) {
                    console.warn(`[${await getERC20Name(token)}] Skip test because liquidityRemove is 0`);
                    return;
                }
                const balanceBefore = await getLpBalanceSnapshot();

                let flag = false;
                await router
                    .removeLiquiditySingleToken(
                        signer.address,
                        currentConfig.marketAddress,
                        liquidityRemove,
                        token,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                    .catch((e) => {
                        // e = EthersJsError.handleEthersJsError(e);
                        if (e instanceof NoRouteFoundError) {
                            flag = true;
                            console.warn(e.message);
                            return;
                        }
                        throw e;
                    });

                if (flag) continue;

                const balanceAfter = await getLpBalanceSnapshot();

                verifyLpBalanceChanges(balanceBefore, balanceAfter);
                // lp balance reduced amount equals to liquidity removed
                expect(balanceBefore.lpBalance.sub(balanceAfter.lpBalance)).toEqBN(liquidityRemove);
            }
        });
    });

    describeWrite('Type 1: swap between Sy and PT', () => {
        it('#swapExactPtForSy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const ptInAmount = getPtSwapAmount(balanceBefore, true);
            if (ptInAmount.eq(0)) {
                console.warn('skip test because ptInAmount is 0');
                return;
            }

            await router
                .swapExactPtForSy(signer.address, currentConfig.marketAddress, ptInAmount, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            expect(balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance)).toEqBN(ptInAmount);
        });

        it('#swapPtForExactSy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectSyOut = getSySwapAmount(balanceBefore, false).div(100);
            if (expectSyOut.eq(0)) {
                console.warn('skip test because expectSyOut is 0');
                return;
            }

            let flag = false;
            await router
                .swapPtForExactSy(signer.address, currentConfig.marketAddress, expectSyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            verifySyOut(expectSyOut, netSyOut);
        });

        it('#swapSyForExactPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtOut = getPtSwapAmount(balanceBefore, false);
            if (expectPtOut.eq(0)) {
                console.warn('skip test because expectPtOut is 0');
                return;
            }

            await router
                .swapSyForExactPt(signer.address, currentConfig.marketAddress, expectPtOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            // we know exactly how much PT we get out
            expect(netPtOut).toEqBN(expectPtOut);
        });

        it('#swapExactSyForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectSyIn = getSySwapAmount(balanceBefore, true);
            if (expectSyIn.eq(0)) {
                console.warn('skip test because expectSyIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactSyForPt(signer.address, currentConfig.marketAddress, expectSyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netSyIn = balanceAfter.syBalance.sub(balanceBefore.syBalance).mul(-1);
            expect(netSyIn).toEqBN(expectSyIn);
        });
    });

    describeWrite('Type 2: swap between Sy and YT', () => {
        it('#swapExactSyForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectSyIn = getSySwapAmount(balanceBefore, true);
            if (expectSyIn.eq(0)) {
                console.warn('skip test because expectSyIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactSyForYt(signer.address, currentConfig.marketAddress, expectSyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            // Cannot use `verifyBalanceChanges` because the underlying logic of swapping YT/SY
            const netSyIn = balanceAfter.syBalance.sub(balanceBefore.syBalance).mul(-1);
            expect(netSyIn).toEqBN(expectSyIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapYtForExactSy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            // Swap with YT involves approximation, so we divide the amount by 10
            // to avoid approx fail
            const expectSyOut = getSySwapAmount(balanceBefore, false).div(10);
            if (expectSyOut.eq(0)) {
                console.warn('skip test because expectSyOut is 0');
                return;
            }

            let flag = false;
            await router
                .swapYtForExactSy(signer.address, currentConfig.marketAddress, expectSyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netSyOut = balanceAfter.syBalance.sub(balanceBefore.syBalance);
            verifySyOut(expectSyOut, netSyOut);
            expect(balanceAfter.ytBalance).toBeLtBN(balanceBefore.ytBalance);
        });

        it('#swapSyForExactYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtOut = getYtSwapAmount(balanceBefore, false);
            if (expectYtOut.eq(0)) {
                console.warn('skip test because expectYtOut is 0');
                return;
            }

            await router
                .swapSyForExactYt(signer.address, currentConfig.marketAddress, expectYtOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toBeGteBN(expectYtOut);
            expect(balanceAfter.syBalance).toBeLtBN(balanceBefore.syBalance);
        });

        it('#swapExactYtForSy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                console.warn('skip test because expectYtIn is 0');
                return;
            }

            await router
                .swapExactYtForSy(signer.address, currentConfig.marketAddress, expectYtIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.syBalance).toBeGtBN(balanceBefore.syBalance);
        });
    });

    describeWrite('Type 3: swap Token with PT & YT', () => {
        // TODO check swap from other raw tokens
        it('#swapExactTokenForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectRawTokenIn = getTokenSwapAmount(balanceBefore, true);
            if (expectRawTokenIn.eq(0)) {
                console.warn('skip test because expectRawTokenIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactTokenForPt(
                    signer.address,
                    currentConfig.marketAddress,
                    currentConfig.tokenToSwap,
                    expectRawTokenIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError || e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);

            expect(netRawTokenIn).toEqBN(expectRawTokenIn);
            expect(balanceAfter.ptBalance).toBeGtBN(balanceBefore.ptBalance);
        });

        it('#swapExactPtForToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore, true);
            if (expectPtIn.eq(0)) {
                console.warn('skip test because expectPtIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactPtForToken(
                    signer.address,
                    currentConfig.marketAddress,
                    expectPtIn,
                    currentConfig.tokenToSwap,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);
            expect(netPtIn).toEqBN(expectPtIn);
            expect(balanceAfter.tokenBalance).toBeGtBN(balanceBefore.tokenBalance);
        });

        it('#swapExactTokenForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectRawTokenIn = getTokenSwapAmount(balanceBefore, true);
            if (expectRawTokenIn.eq(0)) {
                console.warn('skip test because expectRawTokenIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactTokenForYt(
                    signer.address,
                    currentConfig.marketAddress,
                    currentConfig.tokenToSwap,
                    expectRawTokenIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError || e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapExactYtForToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                console.warn('skip test because expectYtIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactYtForToken(
                    signer.address,
                    currentConfig.marketAddress,
                    expectYtIn,
                    currentConfig.tokenToSwap,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.tokenBalance).toBeGtBN(balanceBefore.tokenBalance);
        });
    });

    /*
     * Type 4: Mint, redeem PY & SY -> Token
     */
    describeWrite('Type 4: mint, redeem PY & SY -> Token', () => {
        it('#mintPyFromToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectRawTokenIn = DEFAULT_MINT_AMOUNT;
            if (expectRawTokenIn.eq(0)) {
                console.warn('skip test because expectRawTokenIn is 0');
                return;
            }

            let flag = false;
            await router
                .mintPyFromToken(
                    signer.address,
                    currentConfig.market.YT,
                    currentConfig.tokenToSwap,
                    expectRawTokenIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);

            const mintedPt = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            const mintedYt = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(mintedPt).toEqBN(mintedYt);
            expect(mintedPt).toBeGtBN(0);
        });

        it('#redeemPyToToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPyIn = getPyRedeemAmount(balanceBefore);
            if (expectPyIn.eq(0)) {
                console.warn('skip test because expectPyIn is 0');
                return;
            }

            let flag = false;
            await router
                .redeemPyToToken(
                    signer.address,
                    currentConfig.market.YT,
                    expectPyIn,
                    currentConfig.tokenToSwap,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);

            expect(netYtIn).toEqBN(expectPyIn);
            expect(netPtIn).toEqBN(expectPyIn);

            expect(balanceAfter.tokenBalance).toBeGtBN(balanceBefore.tokenBalance);
        });

        it('#mintSyFromToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectRawTokenIn = DEFAULT_MINT_AMOUNT;
            if (expectRawTokenIn.eq(0)) {
                console.warn('skip test because expectRawTokenIn is 0');
                return;
            }

            let flag = false;
            await router
                .mintSyFromToken(
                    signer.address,
                    currentConfig.market.SY,
                    currentConfig.tokenToSwap,
                    expectRawTokenIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netRawTokenIn = balanceAfter.tokenBalance.sub(balanceBefore.tokenBalance).mul(-1);
            expect(netRawTokenIn).toEqBN(expectRawTokenIn);
            expect(balanceAfter.syBalance).toBeGtBN(balanceBefore.syBalance);
        });

        it('#redeemSyToToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectSyIn = getSyRedeemAmount(balanceBefore);
            if (expectSyIn.eq(0)) {
                console.warn('skip test because expectSyIn is 0');
                return;
            }

            let flag = false;
            await router
                .redeemSyToToken(
                    signer.address,
                    currentConfig.market.SY,
                    expectSyIn,
                    currentConfig.tokenToSwap,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    // e = EthersJsError.handleEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netSyIn = balanceAfter.syBalance.sub(balanceBefore.syBalance).mul(-1);
            expect(netSyIn).toEqBN(expectSyIn);
            expect(balanceAfter.tokenBalance).toBeGtBN(balanceBefore.tokenBalance);
        });
    });

    describeWrite('Type 5: YT <-> PT', () => {
        it('#swapExactYtForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                console.warn('skip test because expectYtIn is 0');
                return;
            }

            await router
                .swapExactYtForPt(signer.address, currentConfig.marketAddress, expectYtIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceBefore.ytBalance.sub(balanceAfter.ytBalance);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.ptBalance).toBeGtBN(balanceBefore.ptBalance);
        });

        it('#swapExactPtForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore, true);
            if (expectPtIn.eq(0)) {
                console.warn('skip test because expectPtIn is 0');
                return;
            }

            await router
                .swapExactPtForYt(signer.address, currentConfig.marketAddress, expectPtIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netPtIn = balanceBefore.ptBalance.sub(balanceAfter.ptBalance);
            expect(netPtIn).toEqBN(expectPtIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });
    });

    // =============================HELPER FUNCTIONS====================================================
    /**
     * Helper function to get balance snapshot of the market
     */
    async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
        const [ptBalance, syBalance, ytBalance, tokenBalance, marketPtBalance, marketSyBalance] = await Promise.all([
            getBalance(ptAddress, signer.address),
            getBalance(syAddress, signer.address),
            getBalance(ytAddress, signer.address),
            getBalance(currentConfig.tokenToSwap, signer.address),
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

    async function getLpBalanceSnapshot(): Promise<LpBalanceSnapshot> {
        const [lpTotalSupply, lpBalance] = await Promise.all([
            getTotalSupply(marketAddress),
            getBalance(marketAddress, signer.address),
        ]);
        return {
            lpTotalSupply,
            lpBalance,
        };
    }

    function getSySwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean): BN {
        let marketAmount = balanceSnapshot.marketSyBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.syBalance.div(USER_BALANCE_FACTOR);

        let amount = getIn ? minBigNumber(marketAmount, userAmount) : marketAmount;

        return minBigNumber(amount, MAX_SY_SWAP_AMOUNT);
    }

    function getPtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ptBalance.div(USER_BALANCE_FACTOR);

        let amount = getIn ? minBigNumber(marketAmount, userAmount) : marketAmount;

        return minBigNumber(amount, MAX_PT_SWAP_AMOUNT);
    }

    function getYtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        // `pt` is not a typo here
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ytBalance.div(USER_BALANCE_FACTOR);

        let amount = getIn ? minBigNumber(marketAmount, userAmount) : marketAmount;

        return minBigNumber(amount, MAX_YT_SWAP_AMOUNT);
    }

    /**
     * Get a safe amount of token to swap through router.
     *
     * Ideally, this function should calculate the swap amount
     * base on the balanceSnapshot.
     *
     * TODO: Fix this?
     */
    function getTokenSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        return minBigNumber(DEFAULT_SWAP_AMOUNT, balanceSnapshot.tokenBalance.div(USER_BALANCE_FACTOR));
    }

    function getPyRedeemAmount(balanceSnapshot: BalanceSnapshot) {
        return minBigNumber(balanceSnapshot.ptBalance, balanceSnapshot.ytBalance).div(REDEEM_FACTOR);
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

    function verifyLpBalanceChanges(balanceBefore: LpBalanceSnapshot, balanceAfter: LpBalanceSnapshot) {
        const lpBalanceDiff = balanceAfter.lpBalance.sub(balanceBefore.lpBalance);
        const lpTotalSupplyDiff = balanceAfter.lpTotalSupply.sub(balanceBefore.lpTotalSupply);
        expect(lpBalanceDiff).toEqBN(lpTotalSupplyDiff);
    }

    function verifySyOut(expectSyOut: BN, netSyOut: BN) {
        // netSyOut will differ from expectSyOut by 0.1%
        expect(netSyOut).toBeGteBN(expectSyOut);
        // netSyOut <= expectSyOut * 100.1%

        // Add 10_000 in case the expect SyOut is too small
        expect(netSyOut).toBeLteBN(expectSyOut.add(expectSyOut.div(1000)).add(10_000));
    }
});
