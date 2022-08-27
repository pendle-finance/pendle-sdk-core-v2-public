import { Contract, ethers } from 'ethers';
import { Router } from '../../src';
import FUND_KEEPER_ABI from './fundKeeperAbi.json';
import { approveHelper, getBalance, SLIPPAGE_TYPE3 } from './testHelper';
import { ACTIVE_CHAIN_ID, BLOCK_CONFIRMATION, currentConfig, networkConnection } from './testUtils';

const INF = ethers.constants.MaxUint256;

const FUND_FACTOR = 100;

const MINT_PY_PERCENTAGE = 40;
const MINT_SCY_PERCENTAGE = 50;

// typechain for fundKeeper is not available
const FUND_KEEPER = new Contract(currentConfig.fundKeeper, FUND_KEEPER_ABI, networkConnection.signer);

async function fundToken(token: string, user: string) {
    const fund_amount = (await getBalance(token, currentConfig.fundKeeper)).div(FUND_FACTOR);
    if (fund_amount.eq(0)) {
        throw new Error(`Insufficient balance for ${token} to fund`);
    }
    await FUND_KEEPER.transferToMany(token, [user], fund_amount).then((tx: any) => tx.wait(BLOCK_CONFIRMATION));
}

async function main() {
    const signerAddress = await networkConnection.signer!.getAddress()!;
    const tokenIn = currentConfig.market.token;
    const routerAddress = currentConfig.router;
    const ytAddress = currentConfig.market.YT;
    const scyAddress = currentConfig.market.SCY;
    const ptAddress = currentConfig.market.PT;

    const router = new Router(routerAddress, networkConnection, ACTIVE_CHAIN_ID);

    // Inner working of this script:
    // 1. Fund accounts with a tokenIn
    // 2. Mint PY and SCY with the tokenIn
    // 3. Add liquidity for the market

    console.log('funding TokenIn');
    await fundToken(tokenIn, signerAddress);

    console.log('approve TokenIn');
    await approveHelper(tokenIn, routerAddress, INF);

    console.log('minting SCY');
    await router
        .mintScyFromToken(
            signerAddress,
            scyAddress,
            tokenIn,
            (await getBalance(tokenIn, signerAddress)).mul(MINT_SCY_PERCENTAGE).div(100),
            SLIPPAGE_TYPE3
        )
        .then(async (tx: any) => await tx.wait());

    console.log('minting PY');
    await router
        .mintPyFromToken(
            signerAddress,
            ytAddress,
            tokenIn,
            (await getBalance(tokenIn, signerAddress)).mul(MINT_PY_PERCENTAGE).div(100),
            SLIPPAGE_TYPE3
        )
        .then((tx: any) => tx.wait());

    console.log('approving SCY');
    await approveHelper(scyAddress, routerAddress, INF);

    console.log('approving PT');
    await approveHelper(ptAddress, routerAddress, INF);

    console.log('add liquidity');
    await router
        .addLiquidityDualScyAndPt(
            signerAddress,
            currentConfig.marketAddress,
            (await getBalance(scyAddress, signerAddress)).div(10).mul(9),
            (await getBalance(ptAddress, signerAddress)).div(10).mul(9),
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
