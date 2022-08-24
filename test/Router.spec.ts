import { Market, Router } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
    minBN,
} from './util/testUtils';
import {
    getBalance,
    REDEEM_FACTOR,
    SLIPPAGE_TYPE2,
    ADD_LIQUIDITY_FACTOR,
    getTotalSupply,
    REMOVE_LIQUIDITY_FACTOR,
    DEFAULT_SWAP_AMOUNT,
    DEFAULT_MINT_AMOUNT,
    minBigNumber,
    ERC20_ENTITIES,
    MARKET_SWAP_FACTOR,
    USER_SWAP_FACTOR,
} from './util/testHelper';
import { BigNumber as BN } from 'ethers';
import './util/BigNumberMatcher';

type BalanceSnapshot = {
    ptBalance: BN;
    scyBalance: BN;
    ytBalance: BN;
    usdBalance: BN;
    marketPtBalance: BN;
    marketScyBalance: BN;
};

type LpBalanceSnapshot = {
    lpBalance: BN;
    lpTotalSupply: BN;
};

describe(Router, () => {
    const router = Router.getRouter(networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
    });

    describeWrite(() => {
        async function checkState() {
            const market = new Market(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
            let state = await market.contract.readState();
            let ptBalance = (await getBalance('PT', currentConfig.marketAddress)).toString();
            let total__Pt = state.totalPt.toString();

            let scyBalance = (await getBalance('SCY', currentConfig.marketAddress)).toString();
            let total__Scy = state.totalScy.toString();

            console.log({
                ptBalance,
                total__Pt,
                scyBalance,
                total__Scy,
            })
        }
        it('#addLiquidityDualScyAndPt', async () => {
            const scyAdd = (await getBalance('SCY', signer.address)).div(ADD_LIQUIDITY_FACTOR);
            const ptAdd = (await getBalance('PT', signer.address)).div(ADD_LIQUIDITY_FACTOR);

            const lpBalanceBefore = await getBalance('MARKET', signer.address);
            const marketSupplyBefore = await getTotalSupply('MARKET');

            await router
                .addLiquidityDualScyAndPt(signer.address, currentConfig.marketAddress, scyAdd, ptAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));
            const lpBalanceAfter = await getBalance('MARKET', signer.address);
            const marketSupplyAfter = await getTotalSupply('MARKET');

            expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
            expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

            expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
        });

        it('#addLiquidityDualTokenAndPt', async () => {
            // TODO: should revise this test
            let tokens = ['QIUSD', 'USD'];
            for (let token of tokens) {
                const tokenAddAmount = (await getBalance(token, signer.address)).div(ADD_LIQUIDITY_FACTOR);
                const ptAdd = (await getBalance('PT', signer.address)).div(ADD_LIQUIDITY_FACTOR);

                const lpBalanceBefore = await getBalance('MARKET', signer.address);
                const marketSupplyBefore = await getTotalSupply('MARKET');

                await router
                    .addLiquidityDualTokenAndPt(
                        signer.address,
                        currentConfig.marketAddress,
                        ERC20_ENTITIES[token].address,
                        tokenAddAmount,
                        ptAdd,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const lpBalanceAfter = await getBalance('MARKET', signer.address);
                const marketSupplyAfter = await getTotalSupply('MARKET');

                expect(lpBalanceAfter).toBeGtBN(lpBalanceBefore);
                expect(marketSupplyAfter).toBeGtBN(marketSupplyBefore);

                expect(lpBalanceAfter.sub(lpBalanceBefore)).toEqBN(marketSupplyAfter.sub(marketSupplyBefore));
            }
        });

        it('#addLiquiditySinglePt', async () => {
            const ptAdd = (await getBalance('PT', signer.address)).div(ADD_LIQUIDITY_FACTOR);
            const balanceBefore = await getLpBalanceSnapshot();

            await router
                .addLiquiditySinglePt(signer.address, currentConfig.marketAddress, ptAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getLpBalanceSnapshot();
            verifyLpBalanceChanges(balanceBefore, balanceAfter);
        });

        it('#addLiquiditySingleScy', async () => {
            const scyAdd = (await getBalance('SCY', signer.address)).div(ADD_LIQUIDITY_FACTOR);
            const balanceBefore = await getLpBalanceSnapshot();

            await router
                .addLiquiditySingleScy(signer.address, currentConfig.marketAddress, scyAdd, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getLpBalanceSnapshot();
            verifyLpBalanceChanges(balanceBefore, balanceAfter);
        });

        it('#addLiquiditySingleToken', async () => {
            let tokens = ['QIUSD', 'USD'];
            for (let token of tokens) {
                const tokenAddAmount = (await getBalance(token, signer.address)).div(ADD_LIQUIDITY_FACTOR);
                const balanceBefore = await getLpBalanceSnapshot();

                await router
                    .addLiquiditySingleToken(
                        signer.address,
                        currentConfig.marketAddress,
                        ERC20_ENTITIES[token].address,
                        tokenAddAmount,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const balanceAfter = await getLpBalanceSnapshot();
                verifyLpBalanceChanges(balanceBefore, balanceAfter);
            }
        });

        it('#removeLiquidityDualScyAndPt', async () => {
            const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
            const lpBalanceBefore = await getBalance('MARKET', signer.address);
            const marketSupplyBefore = await getTotalSupply('MARKET');

            await router
                .removeLiquidityDualScyAndPt(
                    signer.address,
                    currentConfig.marketAddress,
                    liquidityRemove,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const lpBalanceAfter = await getBalance('MARKET', signer.address);
            const marketSupplyAfter = await getTotalSupply('MARKET');

            // lp balance reduced amount equals to liquidity removed
            expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);
            expect(marketSupplyBefore.sub(marketSupplyAfter)).toEqBN(liquidityRemove);
        });

        it('#removeLiquidityDualTokenAndPt', async () => {
            // TODO: should revise this test
            let tokens = ['QIUSD', 'USD'];
            for (let token of tokens) {
                const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
                const lpBalanceBefore = await getBalance('MARKET', signer.address);
                const marketSupplyBefore = await getTotalSupply('MARKET');

                await router
                    .removeLiquidityDualTokenAndPt(
                        signer.address,
                        currentConfig.marketAddress,
                        liquidityRemove,
                        ERC20_ENTITIES[token].address,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const lpBalanceAfter = await getBalance('MARKET', signer.address);
                const marketSupplyAfter = await getTotalSupply('MARKET');

                expect(lpBalanceBefore.sub(lpBalanceAfter)).toEqBN(liquidityRemove);
                expect(marketSupplyBefore.sub(marketSupplyAfter)).toEqBN(liquidityRemove);
            }
        });

        it('#removeLiquiditySinglePt', async () => {
            const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
            const balanceBefore = await getLpBalanceSnapshot();

            await router
                .removeLiquiditySinglePt(signer.address, currentConfig.marketAddress, liquidityRemove, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getLpBalanceSnapshot();

            verifyLpBalanceChanges(balanceBefore, balanceAfter);
            // lp balance reduced amount equals to liquidity removed
            expect(balanceBefore.lpBalance.sub(balanceAfter.lpBalance)).toEqBN(liquidityRemove);
        });

        it('#removeLiquiditySingleScy', async () => {
            const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
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
            let tokens = ['QIUSD', 'USD'];
            for (let token of tokens) {
                const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REMOVE_LIQUIDITY_FACTOR);
                const balanceBefore = await getLpBalanceSnapshot();

                await router
                    .removeLiquiditySingleToken(
                        signer.address,
                        currentConfig.marketAddress,
                        liquidityRemove,
                        ERC20_ENTITIES[token].address,
                        SLIPPAGE_TYPE2
                    )
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

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

            await router
                .swapExactPtForScy(signer.address, currentConfig.marketAddress, ptInAmount, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);
            expect(balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance)).toEqBN(ptInAmount);
        });

        it('#swapPtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyOut = getScySwapAmount(balanceBefore, false);

            await router
                .swapPtForExactScy(signer.address, currentConfig.marketAddress, expectScyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            verifyBalanceChanges(balanceBefore, balanceAfter);

            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
        });

        it('#swapScyForExactPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtOut = getPtSwapAmount(balanceBefore, false);

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

            await router
                .swapExactScyForPt(signer.address, currentConfig.marketAddress, expectScyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

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

            await router
                .swapExactScyForYt(signer.address, currentConfig.marketAddress, expectScyIn, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            // Cannot use `verifyBalanceChanges` because the underlying logic of swapping YT/SCY
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapYtForExactScy', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyOut = getScySwapAmount(balanceBefore, false);

            await router
                .swapYtForExactScy(signer.address, currentConfig.marketAddress, expectScyOut, SLIPPAGE_TYPE2)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netScyOut = balanceAfter.scyBalance.sub(balanceBefore.scyBalance);
            verifyScyOut(expectScyOut, netScyOut);
            expect(balanceAfter.ytBalance).toBeLtBN(balanceBefore.ytBalance);
        });

        it('#swapScyForExactYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtOut = getYtSwapAmount(balanceBefore, false);

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
         */

        it('#swapExactTokenForPt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdIn = getUsdSwapAmount(balanceBefore, true);

            await router
                .swapExactTokenForPt(
                    signer.address,
                    currentConfig.marketAddress,
                    currentConfig.usdAddress,
                    expectUsdIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdIn = balanceAfter.usdBalance.sub(balanceBefore.usdBalance).mul(-1);

            expect(netUsdIn).toEqBN(expectUsdIn);
            expect(balanceAfter.ptBalance).toBeGtBN(balanceBefore.ptBalance);
        });

        it('#swapExactPtForToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPtIn = getPtSwapAmount(balanceBefore, true);

            await router
                .swapExactPtForToken(
                    signer.address,
                    currentConfig.marketAddress,
                    expectPtIn,
                    currentConfig.usdAddress,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);
            expect(netPtIn).toEqBN(expectPtIn);
            expect(balanceAfter.usdBalance).toBeGtBN(balanceBefore.usdBalance);
            await checkState();
        });

        it('#swapExactTokenForYt', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdIn = getUsdSwapAmount(balanceBefore, true);

            await router
                .swapExactTokenForYt(
                    signer.address,
                    currentConfig.marketAddress,
                    currentConfig.usdAddress,
                    expectUsdIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdIn = balanceAfter.usdBalance.sub(balanceBefore.usdBalance).mul(-1);
            expect(netUsdIn).toEqBN(expectUsdIn);
            expect(balanceAfter.ytBalance).toBeGtBN(balanceBefore.ytBalance);
        });

        it('#swapExactYtForToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectYtIn = getYtSwapAmount(balanceBefore, true);

            await router
                .swapExactYtForToken(
                    signer.address,
                    currentConfig.marketAddress,
                    expectYtIn,
                    currentConfig.usdAddress,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            expect(netYtIn).toEqBN(expectYtIn);
            expect(balanceAfter.usdBalance).toBeGtBN(balanceBefore.usdBalance);
            await checkState();
        });

        /*
         * Type 4: Mint, redeem PY & SCY -> Token
         */
        it('#mintPyFromToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdIn = DEFAULT_MINT_AMOUNT;

            await router
                .mintPyFromToken(
                    signer.address,
                    currentConfig.ytAddress,
                    currentConfig.usdAddress,
                    expectUsdIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdIn = balanceAfter.usdBalance.sub(balanceBefore.usdBalance).mul(-1);
            expect(netUsdIn).toEqBN(expectUsdIn);

            const mintedPt = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
            const mintedYt = balanceAfter.ytBalance.sub(balanceBefore.ytBalance);
            expect(mintedPt).toEqBN(mintedYt);
            expect(mintedPt).toBeGtBN(0);
        });

        it('#redeemPyToToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectPyIn = getPyRedeemAmount(balanceBefore);

            if (expectPyIn.eq(0)) {
                return;
            }

            await router
                .redeemPyToToken(
                    signer.address,
                    currentConfig.ytAddress,
                    expectPyIn,
                    currentConfig.usdAddress,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netYtIn = balanceAfter.ytBalance.sub(balanceBefore.ytBalance).mul(-1);
            const netPtIn = balanceAfter.ptBalance.sub(balanceBefore.ptBalance).mul(-1);

            expect(netYtIn).toEqBN(expectPyIn);
            expect(netPtIn).toEqBN(expectPyIn);

            expect(balanceAfter.usdBalance).toBeGtBN(balanceBefore.usdBalance);
        });

        it('#mintScyFromToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectUsdIn = DEFAULT_MINT_AMOUNT;

            await router
                .mintScyFromToken(
                    signer.address,
                    currentConfig.scyAddress,
                    currentConfig.usdAddress,
                    expectUsdIn,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netUsdIn = balanceAfter.usdBalance.sub(balanceBefore.usdBalance).mul(-1);
            expect(netUsdIn).toEqBN(expectUsdIn);
            expect(balanceAfter.scyBalance).toBeGtBN(balanceBefore.scyBalance);
        });

        it('#redeemScyToToken', async () => {
            const balanceBefore = await getBalanceSnapshot();
            const expectScyIn = getScyRedeemAmount(balanceBefore);

            if (expectScyIn.eq(0)) {
                return;
            }

            await router
                .redeemScyToToken(
                    signer.address,
                    currentConfig.scyAddress,
                    expectScyIn,
                    currentConfig.usdAddress,
                    SLIPPAGE_TYPE2
                )
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const balanceAfter = await getBalanceSnapshot();
            const netScyIn = balanceAfter.scyBalance.sub(balanceBefore.scyBalance).mul(-1);
            expect(netScyIn).toEqBN(expectScyIn);
            expect(balanceAfter.usdBalance).toBeGtBN(balanceBefore.usdBalance);
        });
    });

    // =============================HELPER FUNCTIONS====================================================
    /**
     * Helper function to get balance snapshot of the market
     */
    async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
        const [ptBalance, scyBalance, ytBalance, usdBalance, marketPtBalance, marketScyBalance] = await Promise.all([
            getBalance('PT', signer.address),
            getBalance('SCY', signer.address),
            getBalance('YT', signer.address),
            getBalance('USD', signer.address),
            getBalance('PT', currentConfig.marketAddress),
            getBalance('SCY', currentConfig.marketAddress),
        ]);
        return {
            ptBalance,
            scyBalance,
            ytBalance,
            usdBalance,
            marketPtBalance,
            marketScyBalance,
        };
    }

    async function getLpBalanceSnapshot(): Promise<LpBalanceSnapshot> {
        const [lpTotalSupply, lpBalance] = await Promise.all([
            getTotalSupply('MARKET'),
            getBalance('MARKET', signer.address),
        ]);
        return {
            lpTotalSupply,
            lpBalance,
        };
    }

    function getScySwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean): BN {
        let marketAmount = balanceSnapshot.marketScyBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.scyBalance.div(USER_SWAP_FACTOR);

        return getIn ? minBN(marketAmount, userAmount) : marketAmount;

    }

    function getPtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ptBalance.div(USER_SWAP_FACTOR);

        return getIn ? minBN(marketAmount, userAmount) : marketAmount;
    }

    function getYtSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
        // `pt` is not a typo here
        let marketAmount = balanceSnapshot.marketPtBalance.div(MARKET_SWAP_FACTOR);
        let userAmount = balanceSnapshot.ytBalance.div(USER_SWAP_FACTOR);

        return getIn ? minBN(marketAmount, userAmount) : marketAmount;
    }

    /**
     * Get a safe amount of USD to swap in router.
     *
     * Ideally, this function should calculate the swap amount
     * base on the balanceSnapshot.
     *
     * TODO: Fix this?
     */
    function getUsdSwapAmount(balanceSnapshot: BalanceSnapshot, getIn: boolean) {
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
        expect(scyBalanceDiff).toBeLtBN(marketScyBalanceDiff.mul(-1));
    }

    function verifyLpBalanceChanges(balanceBefore: LpBalanceSnapshot, balanceAfter: LpBalanceSnapshot) {
        const lpBalanceDiff = balanceAfter.lpBalance.sub(balanceBefore.lpBalance);
        const lpTotalSupplyDiff = balanceAfter.lpTotalSupply.sub(balanceBefore.lpTotalSupply);
        expect(lpBalanceDiff).toEqBN(lpTotalSupplyDiff.mul(-1));
        // Balance should change
        expect(lpBalanceDiff).not.toEqBN(0);
    }

    function verifyScyOut(expectScyOut: BN, netScyOut: BN) {
        // netScyOut will differ from expectScyOut by 0.1%
        expect(netScyOut).toBeGteBN(expectScyOut);
        // netScyOut < expectScyOut * 100.1%
        expect(netScyOut).toBeLtBN(expectScyOut.add(expectScyOut.div(1000)));
    }
});
