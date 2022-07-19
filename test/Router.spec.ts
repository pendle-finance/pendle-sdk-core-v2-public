import { BigNumber } from 'ethers';
import { type Address, Router } from '../src';
import { ERC20 } from '../src/entities/ERC20';
import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

/*
 * Reminder for all test need to run each write seperate
 */

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(Router, () => {
    const router = new Router(currentConfig.router, networkConnection, ACTIVE_CHAIN_ID);
    const usd = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new ERC20(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new ERC20(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pt = new ERC20(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const market = new ERC20(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
        expect(router.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#addLiquidity', async () => {
        const beforeMarketBalance = await market.contract.balanceOf(signer.address);
        const scyApproveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await scyApproveTx.wait(1);
        const ptApproveTx = await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await ptApproveTx.wait(1);
        const addLiquidityTx = await router.addLiquidity(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(19),
            BigNumber.from(10).pow(19),
            0
        );
        await addLiquidityTx.wait(1);
        const afterMarketBalance = await market.contract.balanceOf(signer.address);
        expect(afterMarketBalance.toBigInt()).toBeGreaterThan(beforeMarketBalance.toBigInt());
    });

    it('#removeLiquidity', async () => {
        const beforeMarketBalance = await market.contract.balanceOf(signer.address);
        const marketApprove = await market.approve(currentConfig.router, BigNumber.from(10).pow(18));
        await marketApprove.wait(1);
        const removeLiquidityTx = await router.removeLiquidity(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            0
        );
        await removeLiquidityTx.wait(1);
        const afterMarketBalance = await market.contract.balanceOf(signer.address);
        expect(afterMarketBalance.toBigInt()).toBeLessThan(beforeMarketBalance.toBigInt());
    });

    /*
     *  Type 1 of swap between Scy and PT
     */
    it('#swapExactPtForScy', async () => {
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const ptApprove = await pt.approve(currentConfig.router, BigNumber.from(10).pow(15));
        await ptApprove.wait(1);
        const swapTx = await router.swapExactPtForScy(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(15),
            0
        );
        await swapTx.wait(1);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
    });

    it('#swapPtForExactScy', async () => {
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await pt.approve(currentConfig.router, BigNumber.from(10).pow(18));
        await approveTx.wait(1);
        const swapTx = await router.swapPtForExactScy(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(16),
            1
        );
        await swapTx.wait(1);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
    });

    it('#swapScyForExactPt', async () => {
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await approveTx.wait(1);
        const swapTx = await router.swapScyForExactPt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            1
        );
        await swapTx.wait(1);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
    });

    it('#swapExactScyForPt', async () => {
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await approveTx.wait(1);
        const swapTx = await router.swapExactScyForPt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(17),
            0
        );
        await swapTx.wait(1);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
    });

    /*
     * Type 2 of swap between Scy and YT
     */

    it('#swapExactScyForYt', async () => {
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await approveTx.wait(1);
        const swapTx = await router.swapExactScyForYt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            0
        );
        await swapTx.wait(1);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
    });

    it('#swapYtForExactScy', async () => {
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await yt.approve(currentConfig.router, BigNumber.from(10).pow(19).mul(2));
        await approveTx.wait(1);
        const swapTx = await router.swapYtForExactScy(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            1
        );
        await swapTx.wait(1);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
    });

    it('#swapScyForExactYt', async () => {
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const scyApproveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await scyApproveTx.wait(1);
        const swapTx = await router.swapScyForExactYt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            0
        );
        await swapTx.wait(1);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
    });

    it('#swapExactYtForScy', async () => {
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await yt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await approveTx.wait(1);
        const swapTx = await router.swapExactYtForScy(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(1),
            0
        );
        await swapTx.wait(1);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
    });

    /*
     * Type 3: Raw token with PT & YT
     */

    it('#swapExactRawTokenForPt', async () => {
        jest.setTimeout(300000);
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const approveTx = await usd.approve(currentConfig.router, BigNumber.from(10).pow(16));
        await approveTx.wait(1);
        const swapTx = await router.swapExactRawTokenForPt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(16),
            [currentConfig.usdcAddress],
            0
        );
        await swapTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
        expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
    });

    it('#swapExactPtForRawToken', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const approveTx = await pt.approve(currentConfig.router, BigNumber.from(10).pow(15));
        await approveTx.wait(1);
        const swapTx = await router.swapExactPtForRawToken(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(15),
            [currentConfig.usdcAddress],
            0
        );
        await swapTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
        expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
    });

    it('#swapExactRawTokenForYt', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const approveTx = await usd.approve(currentConfig.router, BigNumber.from(10).pow(16));
        await approveTx.wait(1);
        const swapTx = await router.swapExactRawTokenForYt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(16),
            [currentConfig.usdcAddress],
            0
        );
        await swapTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
        expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
    });

    it('#swapExactYtForRawToken', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const approveTx = await yt.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await approveTx.wait(1);
        const swapTx = await router.swapExactYtForRawToken(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(4),
            [currentConfig.usdcAddress],
            0
        );
        await swapTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
        expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
    });
    /*
     * Type 4: Mint, redeem PY & SCY -> Raw token
     */

    it('#mintPyFromRawToken', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const approveTx = await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await approveTx.wait(1);
        const mintTx = await router.mintPyFromRawToken(
            signer.address,
            currentConfig.ytAddress,
            BigNumber.from(10).pow(18),
            [currentConfig.usdcAddress],
            0
        );
        await mintTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
        expect(ytBalanceAfter.toBigInt()).toBeGreaterThan(ytBalanceBefore.toBigInt());
        expect(ptBalanceAfter.toBigInt()).toBeGreaterThan(ptBalanceBefore.toBigInt());
    });

    it('#redeemPyToRawToken', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const ytBalanceBefore = await yt.contract.balanceOf(signer.address);
        const ptBalanceBefore = await pt.contract.balanceOf(signer.address);
        const ptApproveTx = await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await ptApproveTx.wait(1);
        const ytApproveTx = await yt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await ytApproveTx.wait(1);
        const redeemTx = await router.redeemPyToRawToken(
            signer.address,
            currentConfig.ytAddress,
            BigNumber.from(10).pow(19),
            [currentConfig.usdcAddress],
            0
        );
        await redeemTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const ytBalanceAfter = await yt.contract.balanceOf(signer.address);
        const ptBalanceAfter = await pt.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
        expect(ytBalanceAfter.toBigInt()).toBeLessThan(ytBalanceBefore.toBigInt());
        expect(ptBalanceAfter.toBigInt()).toBeLessThan(ptBalanceBefore.toBigInt());
    });

    it('#mintScyFromRawToken', async () => {
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await approveTx.wait(1);
        const mintTx = await router.mintScyFromRawToken(
            signer.address,
            currentConfig.scyAddress,
            BigNumber.from(10).pow(18),
            [currentConfig.usdcAddress],
            0
        );
        await mintTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeLessThan(usdBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
    });

    it('#redeemScyToRawToken', async () => {
        jest.setTimeout(300000);
        const usdBalanceBefore = await usd.contract.balanceOf(signer.address);
        const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
        const approveTx = await scy.approve(currentConfig.router, BigNumber.from(10).pow(18));
        await approveTx.wait(1);
        const redeemTx = await router.redeemScyToRawToken(
            signer.address,
            currentConfig.scyAddress,
            BigNumber.from(10).pow(18),
            [currentConfig.usdcAddress],
            0
        );
        await redeemTx.wait(1);
        const usdBalanceAfter = await usd.contract.balanceOf(signer.address);
        const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
        expect(usdBalanceAfter.toBigInt()).toBeGreaterThan(usdBalanceBefore.toBigInt());
        expect(scyBalanceAfter.toBigInt()).toBeLessThan(scyBalanceBefore.toBigInt());
    });
});
