import { Router, ScyEntity } from '../src';
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
    MAX_SCY_SWAP_AMOUNT,
    MAX_PT_SWAP_AMOUNT,
    MAX_YT_SWAP_AMOUNT,
    MAX_PT_ADD_AMOUNT,
    MAX_TOKEN_ADD_AMOUNT,
    MAX_SCY_ADD_AMOUNT,
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import './util/bigNumberMatcher';
import { getRouterStatic } from '../src/entities/helper';
import { ApproximateError, EthersJsError, NoRouteFoundError } from '../src/errors';

type BalanceSnapshot = {
    ptBalance: BN;
    scyBalance: BN;
    ytBalance: BN;
    tokenBalance: BN;
    marketPtBalance: BN;
    marketScyBalance: BN;
};

type LpBalanceSnapshot = {
    lpBalance: BN;
    lpTotalSupply: BN;
};

describe(Router, () => {
    const router = Router.getRouter(networkConnection, ACTIVE_CHAIN_ID);
    const routerStatic = getRouterStatic(networkConnection.provider, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const marketAddress = currentConfig.market.market;
    const scyAddress = currentConfig.market.SCY;
    const ptAddress = currentConfig.market.PT;
    const ytAddress = currentConfig.market.YT;
    const scySdk = new ScyEntity(scyAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite(() => {
        it('#addLiquidityDualScyAndPt', async () => {
            const scyAdd = minBigNumber(
                MAX_SCY_ADD_AMOUNT,
                (await getBalance(scyAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );
            const ptAdd = minBigNumber(
                MAX_PT_ADD_AMOUNT,
                (await getBalance(ptAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );

            if (scyAdd.eq(0) || ptAdd.eq(0)) {
                console.warn('skip test because scyAdd or ptAdd is 0');
                return;
            }

            const lpBalanceBefore = await getBalance(marketAddress, signer.address);
            const marketSupplyBefore = await getTotalSupply(marketAddress);

            await router
                .addLiquidityDualScyAndPt(signer.address, currentConfig.marketAddress, scyAdd, ptAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const lpBalanceAfter = await getBalance(marketAddress, signer.address);
            const marketSupplyAfter = await getTotalSupply(marketAddress);

            expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
            expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
        });

        it('#addLiquidityDualTokenAndPt', async () => {
            // TODO: add liquidity from other raw tokens
            let tokensIn = await scySdk.contract.getTokensIn();
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
                    e = EthersJsError.makeEthersJsError(e);
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

        it('#addLiquiditySingleScy', async () => {
            const scyAdd = minBigNumber(
                MAX_SCY_ADD_AMOUNT,
                (await getBalance(scyAddress, signer.address)).div(USER_BALANCE_FACTOR)
            );
            if (scyAdd.eq(0)) {
                console.warn('skip test because scyAdd is 0');
                return;
            }
            const balanceBefore = await getLpBalanceSnapshot();

            let flag = false;
            await router
                .addLiquiditySingleScy(signer.address, currentConfig.marketAddress, scyAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
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
            let tokensIn = await scySdk.contract.getTokensIn();
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
                        e = EthersJsError.makeEthersJsError(e);
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

        it('#removeLiquidityDualScyAndPt', async () => {
            const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(REMOVE_LIQUIDITY_FACTOR);

            if (liquidityRemove.eq(0)) {
                console.warn('skip test because liquidityRemove is 0');
                return;
            }
            const lpBalanceBefore = await getBalance(marketAddress, signer.address);
            const marketSupplyBefore = await getTotalSupply(marketAddress);

            await router
                .removeLiquidityDualScyAndPt(
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
            let tokensIn = await scySdk.contract.getTokensIn();
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
                    e = EthersJsError.makeEthersJsError(e);
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

        it('#removeLiquiditySingleScy', async () => {
            const liquidityRemove = (await getBalance(marketAddress, signer.address)).div(REMOVE_LIQUIDITY_FACTOR_ZAP);
            if (liquidityRemove.eq(0)) {
                console.warn('skip test because liquidityRemove is 0');
            }
            const balanceBefore = await getLpBalanceSnapshot();

            await router
                .removeLiquiditySingleScy(signer.address, currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getLpBalanceSnapshot();

            verifyLpBalanceChanges(balanceBefore, balanceAfter);
            // lp balance reduced amount equals to liquidity removed
            expect(balanceBefore.lpBalance.sub(balanceAfter.lpBalance)).toEqBN(liquidityRemove);
        });

        it('#removeLiquiditySingleToken', async () => {
            // TODO: remove liquidity to other raw tokens
            let tokensIn = await scySdk.contract.getTokensIn();
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
                        e = EthersJsError.makeEthersJsError(e);
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

        /*
         *  Type 1 of swap between Scy and PT
         */
        it('#swapExactPtForScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const ptInAmount = getPtSwapAmount(balanceBefore, true);
            if (ptInAmount.eq(0)) {
                console.warn('skip test because ptInAmount is 0');
                return;
            }

            await router
                .swapExactPtForScy(signer.address, currentConfig.marketAddress, ptInAmount, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            expect(balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance)).toEqBN(ptInAmount);
        });

        it('#swapPtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyOut = getScySwapAmount(balanceBefore, false).div(100);
            if (expectScyOut.eq(0)) {
                console.warn('skip test because expectScyOut is 0');
                return;
            }

            let flag = false;
            await router
                .swapPtForExactScy(signer.address, currentConfig.marketAddress, expectScyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
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

            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
        });

        it('#swapScyForExactPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtOut = getPtSwapAmount(balanceBefore, false);
            if (expectPtOut.eq(0)) {
                console.warn('skip test because expectPtOut is 0');
                return;
            }

            await router
                .swapScyForExactPt(signer.address, currentConfig.marketAddress, expectPtOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            // we know exactly how much PT we get out
            expect(netPtOut).toEqBN(expectPtOut);
        });

        it('#swapExactScyForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScySwapAmount(balanceBefore, true);
            if (expectScyIn.eq(0)) {
                console.warn('skip test because expectScyIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactScyForPt(signer.address, currentConfig.marketAddress, expectScyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
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

            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
        });

        /*
         * Type 2 of swap between Scy and YT
         */

        it('#swapExactScyForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScySwapAmount(balanceBefore, true);
            if (expectScyIn.eq(0)) {
                console.warn('skip test because expectScyIn is 0');
                return;
            }

            let flag = false;
            await router
                .swapExactScyForYt(signer.address, currentConfig.marketAddress, expectScyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            // Cannot use `verifyBalanceChanges` because the underlying logic of swapping YT/SCY
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapYtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            // Swap with YT involves approximation, so we divide the amount by 10
            // to avoid approx fail
            const expectScyOut = getScySwapAmount(balanceBefore, false).div(10);
            if (expectScyOut.eq(0)) {
                console.warn('skip test because expectScyOut is 0');
                return;
            }

            let flag = false;
            await router
                .swapYtForExactScy(signer.address, currentConfig.marketAddress, expectScyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
                    if (e instanceof ApproximateError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
            expect(balanceAfter.ytBalance).toBeLtBN(balanceBefore.ytBalance);
        });

        it('#swapScyForExactYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtOut = getYtSwapAmount(balanceBefore, false);
            if (expectYtOut.eq(0)) {
                console.warn('skip test because expectYtOut is 0');
                return;
            }

            await router
                .swapScyForExactYt(signer.address, currentConfig.marketAddress, expectYtOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toBeGteBN(expectYtOut);
            expect(balanceAfter.scyBalance).toBeLtBN(balanceBefore.scyBalance);
        });

        it('#swapExactYtForScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);
            if (expectYtIn.eq(0)) {
                console.warn('skip test because expectYtIn is 0');
                return;
            }

            await router
                .swapExactYtForScy(signer.address, currentConfig.marketAddress, expectYtIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.scyBalance).toBeGtBN(balanceBefore.scyBalance);
        });

        /*
         * Type 3: Token with PT & YT
         * TODO: check swap from other raw tokens
         */

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
                    e = EthersJsError.makeEthersJsError(e);
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
                    e = EthersJsError.makeEthersJsError(e);
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
                    e = EthersJsError.makeEthersJsError(e);
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
                    e = EthersJsError.makeEthersJsError(e);
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

        /*
         * Type 4: Mint, redeem PY & SCY -> Token
         */
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
                    e = EthersJsError.makeEthersJsError(e);
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
                    e = EthersJsError.makeEthersJsError(e);
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

        it('#mintScyFromToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectRawTokenIn = DEFAULT_MINT_AMOUNT;
            if (expectRawTokenIn.eq(0)) {
                console.warn('skip test because expectRawTokenIn is 0');
                return;
            }

            let flag = false;
            await router
                .mintScyFromToken(
                    signer.address,
                    currentConfig.market.SCY,
                    currentConfig.tokenToSwap,
                    expectRawTokenIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
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
            expect(balanceAfter.scyBalance).toBeGtBN(balanceBefore.scyBalance);
        });

        it('#redeemScyToToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScyRedeemAmount(balanceBefore);
            if (expectScyIn.eq(0)) {
                console.warn('skip test because expectScyIn is 0');
                return;
            }

            let flag = false;
            await router
                .redeemScyToToken(
                    signer.address,
                    currentConfig.market.SCY,
                    expectScyIn,
                    currentConfig.tokenToSwap,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
                .catch((e) => {
                    e = EthersJsError.makeEthersJsError(e);
                    if (e instanceof NoRouteFoundError) {
                        flag = true;
                        console.warn(e.message);
                        return;
                    }
                    throw e;
                });

            if (flag) return;

            const balanceAfter = await getBalanceSnapshot();
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.tokenBalance).toBeGtBN(balanceBefore.tokenBalance);
        });
    });

    // =============================HELPER FUNCTIONS====================================================
    /**
     * Helper function to get balance snapshot of the market
     */
    async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
        const [ptBalance, scyBalance, ytBalance, tokenBalance, marketPtBalance, marketScyBalance] = await Promise.all([
            getBalance(ptAddress, signer.address),
            getBalance(scyAddress, signer.address),
            getBalance(ytAddress, signer.address),
            getBalance(currentConfig.tokenToSwap, signer.address),
            getBalance(ptAddress, currentConfig.marketAddress),
            getBalance(scyAddress, currentConfig.marketAddress),
        ]);
        return {
            ptBalance,
            scyBalance,
            ytBalance,
            tokenBalance,
            marketPtBalance,
            marketScyBalance,
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

    function getScySwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean): BN {
        let marketAmount = balanceSnapshot.marketScyBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.scyBalance.div(USER_BALANCE_FACTOR);

        let amount = getIn ? minBigNumber(marketAmount, userAmount) : marketAmount;

        return minBigNumber(amount, MAX_SCY_SWAP_AMOUNT);
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

    function getScyRedeemAmount(balanceSnapshot: BalanceSnapshot) {
        return balanceSnapshot.scyBalance.div(REDEEM_FACTOR);
    }

    function verifyBalanceChanges(balanceBefore: BalanceSnapshot, balanceAfter: BalanceSnapshot) {
        const ptBalanceDiff = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
        const marketPtBalanceDiff = balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance);
        expect(ptBalanceDiff).toEqBN(marketPtBalanceDiff.mul(-1));

        const scyBalanceDiff = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
        const marketScyBalanceDiff = balanceAfter.marketScyBalance.sub(balanceBefore.marketScyBalance);
        expect(scyBalanceDiff).toBeLteBN(marketScyBalanceDiff.mul(-1));
    }

    function verifyLpBalanceChanges(balanceBefore: LpBalanceSnapshot, balanceAfter: LpBalanceSnapshot) {
        const lpBalanceDiff = balanceAfter.lpBalance.sub(balanceBefore.lpBalance);
        const lpTotalSupplyDiff = balanceAfter.lpTotalSupply.sub(balanceBefore.lpTotalSupply);
        expect(lpBalanceDiff).toEqBN(lpTotalSupplyDiff);
    }

    function verifyScyOut(expectScyOut: BN, netScyOut: BN) {
        // netScyOut will differ from expectScyOut by 0.1%
        expect(netScyOut).toBeGteBN(expectScyOut);
        // netScyOut <= expectScyOut * 100.1%

        // Add 10_000 in case the expect ScyOut is too small
        expect(netScyOut).toBeLteBN(expectScyOut.add(expectScyOut.div(1000)).add(10_000));
    }
});
