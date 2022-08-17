import { BigNumber as BN, Contract, ethers } from 'ethers';
import { ACTIVE_CHAIN_ID, BLOCK_CONFIRMATION, currentConfig, networkConnection } from './testUtils';
import FUND_KEEPER_ABI from './fundKeeperAbi.json';
import { ERC20, PT, Router, SCY } from '../../src';
import { SLIPPAGE_TYPE3 } from './testHelper';

const INF = ethers.constants.MaxUint256;
const FUND_AMOUNT: BN = BN.from(10).pow(23);
const USDC_TO_MINT_PY = FUND_AMOUNT.div(10).mul(4);
// A bit higher than PY, so that the SCY price will higher than PT price
const USDC_TO_MINT_SCY = FUND_AMOUNT.div(10).mul(5);

async function main() {
    let signerAddress = await networkConnection.signer?.getAddress()!;
    // typehcain for fundkeeper is not available
    let benQiFundKeeper = new Contract(currentConfig.fundKeeper, FUND_KEEPER_ABI, networkConnection.signer);
    let pendleTreasury = new Contract(currentConfig.pendleTreasury, FUND_KEEPER_ABI, networkConnection.signer);
    let usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    let router = new Router(currentConfig.router, networkConnection, ACTIVE_CHAIN_ID);
    let scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    let pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);

    console.log('funding USDC');
    await benQiFundKeeper
        .transferToMany(currentConfig.usdcAddress, [signerAddress], FUND_AMOUNT)
        .then((tx: any) => tx.wait(BLOCK_CONFIRMATION));

    console.log('funding Pendle');
    await pendleTreasury
        .transferToMany(currentConfig.pendle, [signerAddress], FUND_AMOUNT)
        .then((tx: any) => tx.wait(BLOCK_CONFIRMATION));

    console.log('approving USDC');
    await usdc.approve(currentConfig.router, INF).then((tx) => tx.wait(BLOCK_CONFIRMATION));

    console.log('minting PY');
    await router
        .mintPyFromToken(
            signerAddress,
            currentConfig.ytAddress,
            currentConfig.usdcAddress,
            USDC_TO_MINT_PY,
            SLIPPAGE_TYPE3
        )
        .then((tx: any) => tx.wait());

    console.log('minting SCY');
    await router
        .mintScyFromToken(
            signerAddress,
            currentConfig.scyAddress,
            currentConfig.usdcAddress,
            USDC_TO_MINT_SCY,
            SLIPPAGE_TYPE3
        )
        .then(async (tx: any) => await tx.wait());

    console.log('approving SCY');
    await scy.ERC20.approve(currentConfig.router, INF).then((tx) => tx.wait(BLOCK_CONFIRMATION));

    console.log('approving PT');
    await pt.ERC20.approve(currentConfig.router, INF).then((tx) => tx.wait(BLOCK_CONFIRMATION));

    console.log('add liquidity');
    await router
        .addLiquidity(
            signerAddress,
            currentConfig.marketAddress,
            (await scy.ERC20.balanceOf(signerAddress)).div(10).mul(9),
            (await pt.ERC20.balanceOf(signerAddress)).div(10).mul(9),
            SLIPPAGE_TYPE3
        )
        .then((tx: any) => tx.wait());
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
