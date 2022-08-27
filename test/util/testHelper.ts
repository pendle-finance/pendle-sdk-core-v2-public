import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, BigNumberish } from 'ethers';
import { ERC20, Address } from '../../src';
import { ACTIVE_CHAIN_ID, networkConnection, BLOCK_CONFIRMATION } from './testUtils';

type EntitiesMapType = {
    [entity: Address]: PendleERC20;
};

const ERC20_CREATE_HANDLER = {
    get: function (target: EntitiesMapType, address: Address) {
        if (target[address] === undefined) {
            target[address] = new ERC20(address, networkConnection, ACTIVE_CHAIN_ID).contract.connect(
                networkConnection.signer!
            );
        }
        return target[address];
    },
};

const ERC20_ENTITIES: EntitiesMapType = new Proxy({}, ERC20_CREATE_HANDLER);

export async function getBalance(contract: Address, user: Address): Promise<BN> {
    return ERC20_ENTITIES[contract].balanceOf(user);
}

export async function getTotalSupply(contract: Address): Promise<BN> {
    return ERC20_ENTITIES[contract].totalSupply();
}

export async function getAllowance(contract: Address, user: Address, spender: Address): Promise<BN> {
    return ERC20_ENTITIES[contract].allowance(user, spender);
}

export async function approveHelper(contract: Address, user: Address, amount: BigNumberish) {
    await ERC20_ENTITIES[contract].approve(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export async function transferHelper(contract: Address, user: Address, amount: BN) {
    await ERC20_ENTITIES[contract].transfer(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export function minBigNumber(a: BN, b: BN): BN {
    return a.lt(b) ? a : b;
}

export function trimAddress(address: Address) {
    return address.slice(0, 5) + '...' + address.slice(-3);
}

export const DEFAULT_SWAP_AMOUNT = BN.from(10).pow(15);

export const MARKET_SWAP_FACTOR = 50; // swap amount at most (market balance / 50)

export const USER_SWAP_FACTOR = 5;

export const DEFAULT_MINT_AMOUNT = BN.from(10).pow(12);

export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.5;

export const SLIPPAGE_TYPE3 = 1;

export const REDEEM_FACTOR = 10; // Redeem 1/10 of SCY balance

export const ADD_LIQUIDITY_FACTOR = 40; // Add 1/40 of SCY and PT balance to liquidity pool

export const REMOVE_LIQUIDITY_FACTOR = 40; // Remove 1/40 of LP balance from liquidity pool
