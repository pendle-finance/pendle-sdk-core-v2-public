import { BigNumber } from 'ethers';
import { ERC20, Address } from '../../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, TX_WAIT_TIME } from './testUtils';
export const entities = {
    ['YT']: new ERC20(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['PT']: new ERC20(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['SCY']: new ERC20(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['USDC']: new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['QI']: new ERC20(currentConfig.qiAddress, networkConnection, ACTIVE_CHAIN_ID),
    ['MARKET']: new ERC20(currentConfig.marketAddress, networkConnection, ACTIVE_CHAIN_ID),
};

export async function getBalance(contractName: string, user: Address): Promise<BigNumber> {
    return entities[contractName].balanceOf(user);
}

export async function approveHelper(contractName: string, user: Address, amount: BigNumber) {
    const approveTx = await (entities[contractName] as ERC20).approve(user, amount);
    await approveTx.wait(TX_WAIT_TIME);
}

export async function transferHelper(contractName: string, user: Address, amount: BigNumber) {
    const transferTx = await (entities[contractName] as ERC20).transfer(user, amount);
    await transferTx.wait(TX_WAIT_TIME);
}

//  For config swap factor is 1/20 total balance and redeem is 1/10 total balance

export const SWAP_FACTOR = 20;

export const REDEEM_FACTOR = 10;

export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.5;

export const SLIPPAGE_TYPE3 = 1;

export const ADD_LIQUIDITY_FACTOR = 4;
