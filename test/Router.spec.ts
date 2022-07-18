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
    it.skip('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
        expect(router.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it.skip('#addLiquidity', async () => {
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

    it.skip('#removeLiquidity', async () => {
        await market.approve(currentConfig.router, BigNumber.from(10).pow(18));
        await router.removeLiquidity(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 0, {});
    });

    /*
     *  Type 1 of swap between Scy and PT
     */
    it.skip('#swapExactPtForScy', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(19), 0, {});
    });

    it.skip('#swapPtForExactScy', async () => {
        await pt.approve(currentConfig.router, BigNumber.from(10).pow(19).mul(2));
        await router.swapPtForExactScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 1, {});
    });

    it.skip('#swapScyForExactPt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.contract
            .connect(signer)
            .swapScyForExactPt(
                signer.address,
                currentConfig.marketAddress,
                BigNumber.from(10).pow(18),
                BigNumber.from(10).pow(19),
                {}
            );
    });

    it.skip('#swapExactScyForPt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactScyForPt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(16), 1, {});
    });

    /*
     * Type 2 of swap between Scy and YT
     */

    it.skip('#swapExactScyForYt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactScyForYt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 0, {});
    });

    it.skip('#swapYtForExactScy', async () => {
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(19).mul(2));
        await router.swapYtForExactScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 1, {});
    });

    // exceed scy in limit for 0,1,2,3
    it.skip('#swapScyForExactYt', async () => {
        await scy.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapScyForExactYt(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(18), 2, {});
    });

    it.skip('#swapExactYtForScy', async () => {
        await yt.approve(currentConfig.router, BigNumber.from(10).pow(19));
        await router.swapExactYtForScy(signer.address, currentConfig.marketAddress, BigNumber.from(10).pow(1), 0, {});
    });

    /*
     * Type 3: Raw token with PT & YT
     */

    it.skip('#swapExactRawTokenForPt', async () => {
        await usd.approve(currentConfig.router, BigNumber.from(10).pow(20));
        await router.swapExactRawTokenForPt(
            signer.address,
            currentConfig.marketAddress,
            BigNumber.from(10).pow(18),
            [usdAddress],
            0,
            {}
        );
    });

    it.skip('#swapExactPtForRawToken', async () => {
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

    it.skip('#swapExactRawTokenForYt', async () => {
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

    it.skip('#swapExactYtForRawToken', async () => {
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

    it.skip('#mintPyFromRawToken', async () => {
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

    it.skip('#redeemPyToRawToken', async () => {
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

    it.skip('#mintScyFromRawToken', async () => {
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

    it.skip('#redeemScyToRawToken', async () => {
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
