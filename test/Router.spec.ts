import { ERC20, Router } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    TX_WAIT_TIME,
    WALLET,
} from './util/testUtils';
import {
    getBalance,
    approveHelper,
    REDEEM_FACTOR,
    SWAP_FACTOR,
    SLIPPAGE_TYPE2,
    ADD_LIQUIDITY_FACTOR,
} from './util/testHelper';
import { BigNumber } from 'ethers';
describe(Router, () => {
    const router = new Router(currentConfig.router, networkConnection, ACTIVE_CHAIN_ID);
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
            const beforeMarketBalance = await getBalance('MARKET', signer.address);
            await approveHelper('PT', currentConfig.router, ptAdd);
            const addLiquidityTx = await router.addLiquidity(
                signer.address,
                currentConfig.marketAddress,
                scyAdd,
                ptAdd,
                SLIPPAGE_TYPE2
            );
            await addLiquidityTx.wait(TX_WAIT_TIME);
            const afterMarketBalance = await getBalance('MARKET', signer.address);
            expect(afterMarketBalance.toBigInt()).toBeGreaterThan(beforeMarketBalance.toBigInt());
        });

        it('#removeLiquidity', async () => {
            const liquidityRemove = (await getBalance('MARKET', signer.address)).div(REDEEM_FACTOR);
            const beforeMarketBalance = await getBalance('MARKET', signer.address);
            await approveHelper('MARKET', router.address, liquidityRemove);

            const removeLiquidityTx = await router.removeLiquidity(
                signer.address,
                currentConfig.marketAddress,
                liquidityRemove,
                SLIPPAGE_TYPE2
            );
            await removeLiquidityTx.wait(TX_WAIT_TIME);
            const afterMarketBalance = await getBalance('MARKET', signer.address);
            expect(afterMarketBalance.toBigInt()).toBeLessThan(beforeMarketBalance.toBigInt());
        });

        /*
         *  Type 1 of swap between Scy and PT
         */
        it('#swapExactPtForScy', async () => {
            const [ptBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const swapAmount = ptBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('PT', router.address, swapAmount);
            const swapTx = await router.swapExactPtForScy(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);
            const [ptBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
        });

        it('#swapPtForExactScy', async () => {
            const [ptBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            const getAmount = scyBalanceBefore.div(SWAP_FACTOR).div(SWAP_FACTOR);
            await approveHelper('PT', router.address, ptBalanceBefore);

            const swapTx = await router.swapPtForExactScy(
                signer.address,
                currentConfig.marketAddress,
                getAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);
            const [ptBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());

            // RESET
            await approveHelper('PT', router.address, BigNumber.from(0));
        });

        it('#swapScyForExactPt', async () => {
            const [ptBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            const amountGet = ptBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('SCY', router.address, scyBalanceBefore);

            const swapTx = await router.swapScyForExactPt(
                signer.address,
                currentConfig.marketAddress,
                amountGet,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ptBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());

            // RESET
            await approveHelper('SCY', router.address, BigNumber.from(0));
        });

        it('#swapExactScyForPt', async () => {
            const [ptBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const swapAmount = scyBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('SCY', router.address, swapAmount);

            const swapTx = await router.swapExactScyForPt(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ptBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('PT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
        });

        /*
         * Type 2 of swap between Scy and YT
         */

        it('#swapExactScyForYt', async () => {
            const [ytBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const swapAmount = scyBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('SCY', router.address, swapAmount);

            const swapTx = await router.swapExactScyForYt(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ytBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
        });

        it('#swapYtForExactScy', async () => {
            const [ytBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            const getAmount = scyBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('YT', router.address, ytBalanceBefore);

            const swapTx = await router.swapYtForExactScy(
                signer.address,
                currentConfig.marketAddress,
                getAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ytBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());

            //  RESET
            await approveHelper('YT', router.address, BigNumber.from(0));
        });

        it('#swapScyForExactYt', async () => {
            const [ytBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const getAmount = ytBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('SCY', router.address, scyBalanceBefore);

            const swapTx = await router.swapScyForExactYt(
                signer.address,
                currentConfig.marketAddress,
                getAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ytBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());

            //  RESET
            await approveHelper('SCY', router.address, BigNumber.from(0));
        });

        it('#swapExactYtForScy', async () => {
            const [ytBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const swapAmount = ytBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('YT', router.address, swapAmount);

            const swapTx = await router.swapExactYtForScy(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [ytBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('SCY', signer.address),
            ]);

            expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
        });

        /*
         * Type 3: Raw token with PT & YT
         */

        it('#swapExactRawTokenForPt', async () => {
            jest.setTimeout(300000);
            const [usdBalanceBefore, ptBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('PT', signer.address),
            ]);
            const swapAmount = usdBalanceBefore.div(SWAP_FACTOR).div(SWAP_FACTOR);
            await approveHelper('USDC', router.address, swapAmount);

            const swapTx = await router.swapExactRawTokenForPt(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ptBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('PT', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
            expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
        });

        it('#swapExactPtForRawToken', async () => {
            const [usdBalanceBefore, ptBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('PT', signer.address),
            ]);
            const swapAmount = ptBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('PT', router.address, swapAmount);

            const swapTx = await router.swapExactPtForRawToken(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ptBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('PT', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
            expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
        });

        it('#swapExactRawTokenForYt', async () => {
            const [usdBalanceBefore, ytBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
            ]);

            const swapAmount = usdBalanceBefore.div(SWAP_FACTOR).div(SWAP_FACTOR);
            await approveHelper('USDC', router.address, swapAmount);

            const swapTx = await router.swapExactRawTokenForYt(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ytBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
            expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
        });

        it('#swapExactYtForRawToken', async () => {
            const [usdBalanceBefore, ytBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
            ]);
            const swapAmount = ytBalanceBefore.div(SWAP_FACTOR);
            await approveHelper('YT', router.address, swapAmount);

            const swapTx = await router.swapExactYtForRawToken(
                signer.address,
                currentConfig.marketAddress,
                swapAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await swapTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ytBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
            ]);

            expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
            expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
        });
        /*
         * Type 4: Mint, redeem PY & SCY -> Raw token
         */

        it('#mintPyFromRawToken', async () => {
            const [usdBalanceBefore, ytBalanceBefore, ptBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);
            const mintAmount = usdBalanceBefore.div(SWAP_FACTOR).div(ADD_LIQUIDITY_FACTOR).div(ADD_LIQUIDITY_FACTOR);
            await approveHelper('USDC', router.address, mintAmount);

            const mintTx = await router.mintPyFromRawToken(
                signer.address,
                currentConfig.ytAddress,
                mintAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await mintTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ytBalanceAfter, ptBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
            expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
            expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
        });

        it('#redeemPyToRawToken', async () => {
            const [usdBalanceBefore, ytBalanceBefore, ptBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);

            const redeemAmount =
                ytBalanceBefore >= ptBalanceBefore
                    ? ptBalanceBefore.div(REDEEM_FACTOR)
                    : ytBalanceBefore.div(REDEEM_FACTOR);

            await approveHelper('YT', router.address, redeemAmount);
            await approveHelper('PT', router.address, redeemAmount);

            const redeemTx = await router.redeemPyToRawToken(
                signer.address,
                currentConfig.ytAddress,
                redeemAmount,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await redeemTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, ytBalanceAfter, ptBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
            expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
            expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
        });

        it('#mintScyFromRawToken', async () => {
            const [usdBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('SCY', signer.address),
            ]);

            const amountMint = usdBalanceBefore.div(ADD_LIQUIDITY_FACTOR).div(ADD_LIQUIDITY_FACTOR);
            await approveHelper('USDC', router.address, amountMint);

            const mintTx = await router.mintScyFromRawToken(
                signer.address,
                currentConfig.scyAddress,
                amountMint,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await mintTx.wait(TX_WAIT_TIME);

            const [usdBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
        });

        it('#redeemScyToRawToken', async () => {
            jest.setTimeout(300000);
            const [usdBalanceBefore, scyBalanceBefore] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('SCY', signer.address),
            ]);
            const amountRedeem = scyBalanceBefore.div(REDEEM_FACTOR);

            await approveHelper('SCY', router.address, amountRedeem);

            const redeemTx = await router.redeemScyToRawToken(
                signer.address,
                currentConfig.scyAddress,
                amountRedeem,
                [currentConfig.usdcAddress],
                SLIPPAGE_TYPE2
            );
            await redeemTx.wait(4 * TX_WAIT_TIME);

            const [usdBalanceAfter, scyBalanceAfter] = await Promise.all([
                getBalance('USDC', signer.address),
                getBalance('SCY', signer.address),
            ]);
            expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
            expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
        });
    });
});
