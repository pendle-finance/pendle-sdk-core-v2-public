import { BigNumber as BN, BigNumberish } from 'ethers';
import { ERC20, Address } from '../../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, BLOCK_CONFIRMATION } from './testUtils';

type EntitiesMapType = {
    [entity: string]: ERC20;
};

export const ENTITIES: EntitiesMapType = {
    ['YT']: new ERC20(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['PT']: new ERC20(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['SCY']: new ERC20(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['USDC']: new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['QI']: new ERC20(currentConfig.qiAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['MARKET']: new ERC20(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID),
};

export async function getBalance(contractName: string, user: Address): Promise<BN> {
    return ENTITIES[contractName].balanceOf(user);
}

export async function getTotalSupply(contractName: string): Promise<BN> {
    return ENTITIES[contractName].totalSupply();
}

export async function approveHelper(contractName: string, user: Address, amount: BigNumberish) {
    const approveTx = await (ENTITIES[contractName] as ERC20).approve(user, amount);
    await approveTx.wait(BLOCK_CONFIRMATION);
}

export async function transferHelper(contractName: string, user: Address, amount: BN) {
    const transferTx = await ENTITIES[contractName].transfer(user, amount);
    await transferTx.wait(BLOCK_CONFIRMATION);
}

export function minBigNumber(a: BN, b: BN): BN {
    return a.lt(b) ? a : b;
}

export const DEFAULT_SWAP_AMOUNT = BN.from(10).pow(12);

export const DEFAULT_MINT_AMOUNT = BN.from(10).pow(12);

export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.5;

export const SLIPPAGE_TYPE3 = 1;

export const REDEEM_FACTOR = 10; // Redeem 1/10 of SCY balance

export const ADD_LIQUIDITY_FACTOR = 4; // Add 1/4 of SCY and PT balance to liquidity pool

export const REMOVE_LIQUIDITY_FACTOR = 4; // Remove 1/4 of LP balance from liquidity pool
