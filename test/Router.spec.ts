import { BigNumber } from 'ethers';
import { type Address, Router } from '../src';
import { ERC20 } from '../src/entities/ERC20';
import { getRouterStatic } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(Router, () => {
    const router = new Router(currentConfig.router, networkConnection, ACTIVE_CHAIN_ID);
    const usdAddress = "0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D";
    const usd = new ERC20(usdAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new ERC20(currentConfig.scyAddress,networkConnection,ACTIVE_CHAIN_ID);
    const yt = new ERC20(currentConfig.ytAddress,networkConnection,ACTIVE_CHAIN_ID);
    const pt = new ERC20(currentConfig.ptAddress,networkConnection,ACTIVE_CHAIN_ID);
    const market = new ERC20(currentConfig.marketAddress,networkConnection,ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', async () => {
        expect(router).toBeInstanceOf(Router);
        expect(router.address).toBe(currentConfig.router);
        expect(router.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it.skip('#addLiquidity',async () =>{
        await scy.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.addLiquidity(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),BigNumber.from(10).pow(19),0,{});
    });

    it.skip('#removeLiquidity', async () =>{
        await market.approve(currentConfig.router,BigNumber.from(10).pow(18));
        await router.removeLiquidity(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(18),0,{});
    })

    it.skip('#swapExactPtForScy', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })

    // Exceed limit pt in
    it.skip('#swapPtForExactScy', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19).mul(2));
        await router.swapPtForExactScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(18),0,{});
    })

    it.skip('#swapExactPtForScy', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })

    //  exceed limit SCY in
    it('#swapScyForExactPt', async() =>{
        await scy.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapScyForExactPt(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })

    // it('#swapExactRawTokenForPt', async() =>{
    //     await usd.approve(currentConfig.router,BigNumber.from(10).pow(19));
    //     await router.swapExactRawTokenForPt(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),{});
    // })

    it.skip('#swapExactRawTokenForPt', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })

    it.skip('#swapExactRawTokenForPt', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })

    it.skip('#swapExactRawTokenForPt', async() =>{
        await pt.approve(currentConfig.router,BigNumber.from(10).pow(19));
        await router.swapExactPtForScy(signer.address,currentConfig.marketAddress,BigNumber.from(10).pow(19),0,{});
    })
    
});
