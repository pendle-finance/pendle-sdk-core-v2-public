import { BigNumber as BN, Contract } from 'ethers';
import { Router } from '../../src';
import FUND_KEEPER_ABI from './fundKeeperAbi.json';
import { getBalance, getERC20Decimals, bnMinAsBn, stalkAccount, approveInfHelper } from '../util/testHelper';
import { ACTIVE_CHAIN_ID, BLOCK_CONFIRMATION, currentConfig, networkConnection } from '../util/testEnv';
import { SLIPPAGE_TYPE3 } from '../util/constants';

const FUND_FACTOR = 100;

const MINT_PY_PERCENTAGE = 40;
const MINT_SY_PERCENTAGE = 50;

// typechain for fundKeeper is not available
const FUND_KEEPER = new Contract(currentConfig.fundKeeper, FUND_KEEPER_ABI, networkConnection.signer);

async function fundToken(token: string, user: string) {
    let decimal = await getERC20Decimals(token);

    // 1/50 of the fundKeeper balance, or 100 tokens.

    const fund_amount = bnMinAsBn(
        (await getBalance(token, currentConfig.fundKeeper)).div(FUND_FACTOR),
        BN.from(10).pow(decimal).mul(100)
    );

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
    const syAddress = currentConfig.market.SY;
    const ptAddress = currentConfig.market.PT;

    const router = new Router(routerAddress, ACTIVE_CHAIN_ID, networkConnection);

    // Inner working of this script:
    // 1. Fund accounts with a tokenIn
    // 2. Mint PY and SY with the tokenIn
    // 3. Add liquidity for the market

    console.log('funding TokenIn');
    await fundToken(tokenIn, signerAddress);

    console.log('approve TokenIn');
    await approveInfHelper(tokenIn, routerAddress);

    console.log('minting SY');
    await router
        .mintSyFromToken(
            syAddress,
            tokenIn,
            (await getBalance(tokenIn, signerAddress)).mul(MINT_SY_PERCENTAGE).div(100),
            SLIPPAGE_TYPE3
        )
        .then(async (tx: any) => await tx.wait());

    console.log('minting PY');
    await router
        .mintPyFromToken(
            ytAddress,
            tokenIn,
            (await getBalance(tokenIn, signerAddress)).mul(MINT_PY_PERCENTAGE).div(100),
            SLIPPAGE_TYPE3
        )
        .then((tx: any) => tx.wait());

    console.log('approving SY');
    await approveInfHelper(syAddress, routerAddress);

    console.log('approving PT');
    await approveInfHelper(ptAddress, routerAddress);

    console.log('add liquidity');
    await router
        .addLiquidityDualSyAndPt(
            currentConfig.marketAddress,
            (await getBalance(syAddress, signerAddress)).div(10).mul(9),
            (await getBalance(ptAddress, signerAddress)).div(10).mul(9),
            SLIPPAGE_TYPE3
        )
        .then((tx: any) => tx.wait());

    await stalkAccount(signerAddress, [currentConfig.market]);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
