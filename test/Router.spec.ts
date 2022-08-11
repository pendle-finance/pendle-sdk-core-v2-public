import { ERC20, Router } from '../src';
import { decimalFactor } from '../src/entities/helper';
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
    approveHelper,
    REDEEM_FACTOR,
    SLIPPAGE_TYPE2,
    ADD_LIQUIDITY_FACTOR,
    getTotalSupply,
    REMOVE_LIQUIDITY_FACTOR,
    DEFAULT_SWAP_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    minBigNumber,
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import './util/BigNumberMatcher';

type BalanceSnapshot = {
    ptBalance: BN;
    scyBalance: BN;
    ytBalance: BN;
    usdcBalance: BN;
    marketPtBalance: BN;
    marketScyBalance: BN;
};

describe(Router, () => {
    const router = Router.getRouter(networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite(() => {
        it('#addLiquidity', async () => {
            const scyAdd = (await getBalance('SCY', signer.address)).div(ADD_LIQUIDITY_FACTOR);
            const ptAdd = (await getBalance('PT', signer.address)).div(ADD_LIQUIDITY_FACTOR);
            await approveHelper('SCY', currentConfig.router, scyAdd);
            await approveHelper('PT', currentConfig.router, ptAdd);

            const lpBalanceBefore = await getBalance('MARKET', signer.address);
            const marketSupplyBefore = await getTotalSupply('MARKET');

            const addLiquidityTx = await router.addLiquidity(
                signer.address,
                currentConfig.marketAddress,
                scyAdd,
                ptAdd,
                SLIPPAGE_TYPE2
            );
            await addLiquidityTx.wait(BLOCK_CONFIRMATION);
            const lpBalanceAfter = await getBalance('MARKET', signer.address);
            const marketSupplyAfter = await getTotalSupply('MARKET');

            expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
            expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
        });

        it('#removeLiquidity', async () => {
            const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
            const lpBalanceBefore = await getBalance('MARKET', signer.address);
            const marketSupplyBefore = await getTotalSupply('MARKET');

            await approveHelper('MARKET', router.address, liquidityRemove);

            const removeLiquidityTx = await router.removeLiquidity(
                signer.address,
                currentConfig.marketAddress,
                liquidityRemove,
                SLIPPAGE_TYPE2
            );
            await removeLiquidityTx.wait(BLOCK_CONFIRMATION);

            const lpBalanceAfter = await getBalance('MARKET', signer.address);
            const marketSupplyAfter = await getTotalSupply('MARKET');

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);
            expect(marketSupplyBefore.sub(marketSupplyAfter)).toEqBN(liquidityRemove);
        });

        /*
         *  Type 1 of swap between Scy and PT
         */
        it('#swapExactPtForScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const ptInAmount = getPtSwapAmount(balanceBefore);

            await approveHelper('PT', router.address, ptInAmount);
            const swapTx = await router.swapExactPtForScy(
                signer.address,
                currentConfig.marketAddress,
                ptInAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // Reset approvement
            await approveHelper('PT', router.address, 0);

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            expect(balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance)).toEqBN(ptInAmount);
        });

        it('#swapPtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyOut = getScySwapAmount(balanceBefore);

            await approveHelper('PT', router.address, balanceBefore.ptBalance);
            const swapTx = await router.swapPtForExactScy(
                signer.address,
                currentConfig.marketAddress,
                expectScyOut,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // Reset approvement
            await approveHelper('PT', router.address, 0);

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
        });

        it('#swapScyForExactPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtOut = getPtSwapAmount(balanceBefore);

            await approveHelper('SCY', router.address, balanceBefore.scyBalance);
            const swapTx = await router.swapScyForExactPt(
                signer.address,
                currentConfig.marketAddress,
                expectPtOut,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('SCY', router.address, 0);

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            const netPtOut = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            // we know exactly how much PT we get out
            expect(netPtOut).toEqBN(expectPtOut);
        });

        it('#swapExactScyForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScySwapAmount(balanceBefore);

            await approveHelper('SCY', router.address, expectScyIn);
            const swapTx = await router.swapExactScyForPt(
                signer.address,
                currentConfig.marketAddress,
                expectScyIn,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('SCY', router.address, 0);

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
            const expectScyIn = getScySwapAmount(balanceBefore);

            await approveHelper('SCY', router.address, expectScyIn);
            const swapTx = await router.swapExactScyForYt(
                signer.address,
                currentConfig.marketAddress,
                expectScyIn,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('SCY', router.address, 0);

            const balanceAfter = await getBalanceSnapshot();
            // Cannot use `verifyBalanceChanges` because the underlying logic of swapping YT/SCY
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapYtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyOut = getScySwapAmount(balanceBefore);

            await approveHelper('YT', router.address, balanceBefore.ytBalance);
            const swapTx = await router.swapYtForExactScy(
                signer.address,
                currentConfig.marketAddress,
                expectScyOut,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            //  RESET
            await approveHelper('YT', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
            expect(balanceAfter.ytBalance).toBeLtBN(balanceBefore.ytBalance);
        });

        it('#swapScyForExactYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtOut = getYtSwapAmount(balanceBefore);

            await approveHelper('SCY', router.address, balanceBefore.scyBalance);
            const swapTx = await router.swapScyForExactYt(
                signer.address,
                currentConfig.marketAddress,
                expectYtOut,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            //  RESET
            await approveHelper('SCY', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netYtOut = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(netYtOut).toBeGteBN(expectYtOut);
            expect(balanceAfter.scyBalance).toBeLtBN(balanceBefore.scyBalance);
        });

        it('#swapExactYtForScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore);

            await approveHelper('YT', router.address, expectYtIn);
            const swapTx = await router.swapExactYtForScy(
                signer.address,
                currentConfig.marketAddress,
                expectYtIn,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            //  RESET
            await approveHelper('YT', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.scyBalance).toBeGtBN(balanceBefore.scyBalance);
        });

        /*
         * Type 3: Raw token with PT & YT
         */

        it('#swapExactRawTokenForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdcIn = getUsdcSwapAmount(balanceBefore);

            await approveHelper('USDC', router.address, expectUsdcIn);
            const swapTx = await router.swapExactRawTokenForPt(
                signer.address,
                currentConfig.marketAddress,
                expectUsdcIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('USDC', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdcIn = balanceAfter.usdcBalance.sub(balanceBefore.usdcBalance).mul(-1);

            expect(netUsdcIn).toEqBN(expectUsdcIn);
            expect(balanceAfter.ptBalance).toBeGtBN(balanceBefore.ptBalance);
        });

        it('#swapExactPtForRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore);

            await approveHelper('PT', router.address, expectPtIn);
            const swapTx = await router.swapExactPtForRawToken(
                signer.address,
                currentConfig.marketAddress,
                expectPtIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('PT', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);
            expect(netPtIn).toEqBN(expectPtIn);
            expect(balanceAfter.usdcBalance).toBeGtBN(balanceBefore.usdcBalance);
        });

        it('#swapExactRawTokenForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdcIn = getUsdcSwapAmount(balanceBefore);

            await approveHelper('USDC', router.address, expectUsdcIn);
            const swapTx = await router.swapExactRawTokenForYt(
                signer.address,
                currentConfig.marketAddress,
                expectUsdcIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('USDC', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdcIn = balanceAfter.usdcBalance.sub(balanceBefore.usdcBalance).mul(-1);
            expect(netUsdcIn).toEqBN(expectUsdcIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapExactYtForRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore);

            await approveHelper('YT', router.address, expectYtIn);
            const swapTx = await router.swapExactYtForRawToken(
                signer.address,
                currentConfig.marketAddress,
                expectYtIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('YT', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.usdcBalance).toBeGtBN(balanceBefore.usdcBalance);
        });

        /*
         * Type 4: Mint, redeem PY & SCY -> Raw token
         */
        it('#mintPyFromRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdcIn = DEFAULT_MINT_AMOUNT;

            await approveHelper('USDC', router.address, expectUsdcIn);
            const mintTx = await router.mintPyFromRawToken(
                signer.address,
                currentConfig.ytAddress,
                expectUsdcIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await mintTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('USDC', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdcIn = balanceAfter.usdcBalance.sub(balanceBefore.usdcBalance).mul(-1);
            expect(netUsdcIn).toEqBN(expectUsdcIn);

            const mintedPt = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            const mintedYt = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(mintedPt).toEqBN(mintedYt);
            expect(mintedPt).toBeGtBN(0);
        });

        it('#redeemPyToRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPyIn = getPyRedeemAmount(balanceBefore);

            if (expectPyIn.eq(0)) {
                return;
            }

            await approveHelper('YT', router.address, expectPyIn);
            await approveHelper('PT', router.address, expectPyIn);
            const redeemTx = await router.redeemPyToRawToken(
                signer.address,
                currentConfig.ytAddress,
                expectPyIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await redeemTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('PT', router.address, BN.from(0));
            await approveHelper('YT', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);

            expect(netYtIn).toEqBN(expectPyIn);
            expect(netPtIn).toEqBN(expectPyIn);

            expect(balanceAfter.usdcBalance).toBeGtBN(balanceBefore.usdcBalance);
        });

        it('#mintScyFromRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdcIn = DEFAULT_MINT_AMOUNT;

            await approveHelper('USDC', router.address, expectUsdcIn);
            const mintTx = await router.mintScyFromRawToken(
                signer.address,
                currentConfig.scyAddress,
                expectUsdcIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await mintTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('USDC', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdcIn = balanceAfter.usdcBalance.sub(balanceBefore.usdcBalance).mul(-1);
            expect(netUsdcIn).toEqBN(expectUsdcIn);
            expect(balanceAfter.scyBalance).toBeGtBN(balanceBefore.scyBalance);
        });

        it('#redeemScyToRawToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScyRedeemAmount(balanceBefore);

            if (expectScyIn.eq(0)) {
                return;
            }

            await approveHelper('SCY', router.address, expectScyIn);
            const redeemTx = await router.redeemScyToRawToken(
                signer.address,
                currentConfig.scyAddress,
                expectScyIn,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await redeemTx.wait(BLOCK_CONFIRMATION);
            // RESET
            await approveHelper('SCY', router.address, BN.from(0));

            const balanceAfter = await getBalanceSnapshot();
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.usdcBalance).toBeGtBN(balanceBefore.usdcBalance);
        });
    });

    // =============================HELPER FUNCTIONS====================================================
    /**
     * Helper function to get balance snapshot of the market
     */
    async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
        const [ptBalance, scyBalance, ytBalance, usdcBalance, marketPtBalance, marketScyBalance] = await Promise.all([
            getBalance('PT', signer.address),
            getBalance('SCY', signer.address),
            getBalance('YT', signer.address),
            getBalance('USDC', signer.address),
            getBalance('PT', currentConfig.marketAddress),
            getBalance('SCY', currentConfig.marketAddress),
        ]);
        return {
            ptBalance,
            scyBalance,
            ytBalance,
            usdcBalance,
            marketPtBalance,
            marketScyBalance,
        };
    }

    /**
     * Get a safe amount to swap in router.
     *
     * Ideally, all of the following functions should calculate the swap amount
     * base on the balanceSnapshot.
     *
     * But due to the logic to get the correct swap amount is not yet implemented,
     * we return the default swap amount.
     */
    function getScySwapAmount(balanceSnapshot: BalanceSnapshot) {
        return DEFAULT_SWAP_AMOUNT;
    }

    function getPtSwapAmount(balanceSnapshot: BalanceSnapshot) {
        return DEFAULT_SWAP_AMOUNT;
    }

    function getYtSwapAmount(balanceSnapshot: BalanceSnapshot) {
        return DEFAULT_SWAP_AMOUNT;
    }

    function getUsdcSwapAmount(balanceSnapshot: BalanceSnapshot) {
        return DEFAULT_SWAP_AMOUNT;
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
        expect(scyBalanceDiff).toEqBN(marketScyBalanceDiff.mul(-1));
    }

    function verifyScyOut(expectScyOut: BN, netScyOut: BN) {
        // netScyOut will differ from expectScyOut by 0.1%
        expect(netScyOut).toBeGteBN(expectScyOut);
        // netScyOut < expectScyOut * 100.1%
        expect(netScyOut).toBeLtBN(expectScyOut.add(expectScyOut.div(1000)));
    }
});
