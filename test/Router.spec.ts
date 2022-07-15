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
    const usdAddress = '0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D';
    const usd = new ERC20(usdAddress, networkConnection, ACTIVE_CHAIN_ID);
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
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.addLiquidity(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(19),
            BigNumber.from(10).pow(19),
            0,
            {}
        );
    });

    it('#removeLiquidity', async () => {
        await market.approve(currentConfig.router, BigNumber.from(10).pow(18));
        await router.removeLiquidity(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 0, {});
    });

    /*
     *  Type 1 of swap between Scy and PT
     */
    it('#swapExactPtForScy', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(19), 0, {});
    });

    it('#swapPtForExactScy', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19).mul(2));
        await router.swapPtForExactScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 1, {});
    });

    // 0 fail
    // 1 ,2 ,3 ,4 approx fail
    // expect that > 4 also fail
    it('#swapScyForExactPt', async () => {
        // await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapScyForExactPt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 0, {});
    });

    // "approx fail" for 0,1,2 ???
    it('#swapExactScyForPt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactScyForPt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(19), 2, {});
    });

    /*
     * Type 2 of swap between Scy and YT
     */

    //  "approx fail" for 0,1,2 ???
    it('#swapExactScyForYt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactScyForYt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(19), 2, {});
    });

    //  "approx fail" for 0,1,2 ???
    it('#swapYtForExactScy', async () => {
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(19).mul(2));
        await router.swapYtForExactScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 2, {});
    });

    // exceed scy in limit for 0,1,2,3
    it('#swapScyForExactYt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapScyForExactYt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 2, {});
    });

    it('#swapExactYtForScy', async () => {
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactYtForScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(1), 0, {});
    });

    /*
     * Type 3: Raw token with PT & YT
     */

    // approx fail ( No idea )
    it('#swapExactRawTokenForPt', async () => {
        await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.swapExactRawTokenForPt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(19),
            [usdAddress],
            2,
            {}
        );
    });

    it('#swapExactPtForRawToken', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactPtForRawToken(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(19),
            [usdAddress],
            0,
            {}
        );
    });

    it('#swapExactRawTokenForYt', async () => {
        await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.swapExactRawTokenForYt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(19),
            [usdAddress],
            0,
            {}
        );
    });

    it('#swapExactYtForRawToken', async () => {
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.swapExactYtForRawToken(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(4),
            [usdAddress],
            0,
            {}
        );
    });
    /*
     * Type 4: Mint, redeem PY & SCY -> Raw token
     */

    it('#mintPyFromRawToken', async () => {
        await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.mintPyFromRawToken(
            signer.address,
            currentConfig.ytAddress,
            BigNumber.from(10).pow(18),
            [usdAddress],
            0,
            {}
        );
    });

    it('#redeemPyToRawToken', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.redeemPyToRawToken(
            signer.address,
            currentConfig.ytAddress,
            BigNumber.from(10).pow(19),
            [usdAddress],
            0,
            {}
        );
    });

    it('#mintScyFromRawToken', async () => {
        await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.mintScyFromRawToken(
            signer.address,
            currentConfig.scyAddress,
            BigNumber.from(10).pow(18),
            [usdAddress],
            0,
            {}
        );
    });

    it('#redeemScyToRawToken', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.redeemScyToRawToken(
            signer.address,
            currentConfig.scyAddress,
            BigNumber.from(10).pow(18),
            [usdAddress],
            0,
            {}
        );
    });
});
