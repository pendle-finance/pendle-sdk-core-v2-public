import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, BigNumberish, constants } from 'ethers';
import { ERC20, Address, MarketEntity } from '../../src';
import { isNativeToken } from '../../src/entities/helper';
import { ACTIVE_CHAIN_ID, networkConnection, BLOCK_CONFIRMATION } from './testUtils';

type EntitiesMapType = {
    [entity: Address]: PendleERC20;
};

const ERC20_CREATE_HANDLER = {
    get: function (target: EntitiesMapType, address: Address) {
        if (target[address] === undefined) {
            target[address] = new ERC20(address, networkConnection, ACTIVE_CHAIN_ID).ERC20Contract.connect(
                networkConnection.signer!
            );
        }
        return target[address];
    },
};

const ERC20_ENTITIES: EntitiesMapType = new Proxy({}, ERC20_CREATE_HANDLER);

export async function getBalance(token: Address, user: Address): Promise<BN> {
    if (isNativeToken(token)) {
        return networkConnection.provider.getBalance(user);
    }
    return ERC20_ENTITIES[token].balanceOf(user);
}

export async function getTotalSupply(token: Address): Promise<BN> {
    if (isNativeToken(token)) {
        // throw an error here because this function should not be called
        // if the tests are written correctly
        throw new Error('Cannot get total supply of native token');
    }
    return ERC20_ENTITIES[token].totalSupply();
}

export async function getAllowance(token: Address, user: Address, spender: Address): Promise<BN> {
    if (isNativeToken(token)) {
        return constants.MaxUint256;
    }
    return ERC20_ENTITIES[token].allowance(user, spender);
}

export async function approveHelper(token: Address, user: Address, amount: BigNumberish) {
    if (isNativeToken(token)) {
        return;
    }
    await ERC20_ENTITIES[token].approve(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export async function transferHelper(token: Address, user: Address, amount: BN) {
    await ERC20_ENTITIES[token].transfer(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export function minBigNumber(a: BN, b: BN): BN {
    return a.lt(b) ? a : b;
}

export async function getERC20Name(token: Address): Promise<string> {
    if (isNativeToken(token)) {
        return 'Native';
    }
    return ERC20_ENTITIES[token].name();
}

export async function getERC20Decimals(token: Address): Promise<number> {
    if (isNativeToken(token)) {
        return 18;
    }
    return ERC20_ENTITIES[token].decimals();
}

export async function stalkAccount(user: Address, markets: any[]) {
    for (let market of markets) {
        console.log('Market: ', market.symbol);
        console.log('Portfolio');

        const marketContract = new MarketEntity(market.market, networkConnection, ACTIVE_CHAIN_ID).contract;

        console.log('balanceOf');
        console.log('market                 :', (await marketContract.balanceOf(user)).toString());
        console.log('market active balance  :', (await marketContract.activeBalance(user)).toString());
        console.log('yt                     :', (await getBalance(market.YT, user)).toString());
        console.log('pt                     :', (await getBalance(market.PT, user)).toString());
        console.log('scy                    :', (await getBalance(market.SCY, user)).toString());
    }
}

export const DEFAULT_SWAP_AMOUNT = BN.from(10).pow(15);

export const MAX_PT_SWAP_AMOUNT = BN.from(10).pow(6);
export const MAX_YT_SWAP_AMOUNT = BN.from(10).pow(6);

export const MAX_SCY_SWAP_AMOUNT = BN.from(10).pow(8);

export const MARKET_SWAP_FACTOR = 50; // swap amount at most (market balance / 50)

export const USER_BALANCE_FACTOR = 5;

export const DEFAULT_MINT_AMOUNT = BN.from(10).pow(6);

export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.5;

export const SLIPPAGE_TYPE3 = 1;

export const REDEEM_FACTOR = 10; // Redeem 1/10 of SCY balance

export const MAX_TOKEN_ADD_AMOUNT = BN.from(10).pow(6);

export const MAX_PT_ADD_AMOUNT = BN.from(10).pow(6);

export const MAX_YT_ADD_AMOUNT = BN.from(10).pow(6);

export const MAX_SCY_ADD_AMOUNT = BN.from(10).pow(8);

export const REMOVE_LIQUIDITY_FACTOR = 40; // Remove 1/40 of LP balance from liquidity pool

export const REMOVE_LIQUIDITY_FACTOR_ZAP = 40_000; // Bigger than REMOVE_LIQUIDITY_FACTOR because zap involves swapping
