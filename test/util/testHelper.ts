import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, BigNumberish } from 'ethers';
import { ERC20, Address, MarketEntity, WrappedContract, bnMin, Multicall } from '../../src';
import { isNativeToken } from '../../src/entities/helper';
import { INF } from './constants';
import { ACTIVE_CHAIN_ID, networkConnection, BLOCK_CONFIRMATION, USE_HARDHAT_RPC, currentConfig } from './testEnv';
import { inspect } from 'util';

type EntitiesMapType = {
    [entity: Address]: WrappedContract<PendleERC20>;
};

const ERC20_CREATE_HANDLER = {
    get: function (target: EntitiesMapType, address: Address) {
        if (target[address] === undefined) {
            target[address] = new ERC20(address, ACTIVE_CHAIN_ID, {
                ...networkConnection,
                multicall: currentConfig.multicall,
            }).contract;
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
        return INF;
    }
    return ERC20_ENTITIES[token].allowance(user, spender);
}

export async function approveHelper(token: Address, user: Address, amount: BigNumberish) {
    if (isNativeToken(token)) {
        return;
    }
    await ERC20_ENTITIES[token].approve(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export async function approveInfHelper(token: Address, user: Address) {
    await approveHelper(token, user, INF);
}

export async function transferHelper(token: Address, user: Address, amount: BN) {
    await ERC20_ENTITIES[token].transfer(user, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export function bnMinAsBn(a: BN, b: BN): BN {
    return BN.from(bnMin(a, b));
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

        const marketEntity = new MarketEntity(market.market, ACTIVE_CHAIN_ID, networkConnection);

        console.log('balanceOf');
        console.log('market                 :', (await marketEntity.balanceOf(user)).toString());
        console.log('market active balance  :', (await marketEntity.activeBalance(user)).toString());
        console.log('yt                     :', (await getBalance(market.YT, user)).toString());
        console.log('pt                     :', (await getBalance(market.PT, user)).toString());
        console.log('sy                     :', (await getBalance(market.SY, user)).toString());
    }
}

export async function evm_snapshot(): Promise<string> {
    if (!USE_HARDHAT_RPC) throw new Error('evm_snapshot is only available when using hardhat rpc');
    return networkConnection.provider.send('evm_snapshot', []);
}

export async function evm_revert(snapshotId: string): Promise<void> {
    if (!USE_HARDHAT_RPC) throw new Error('evm_revert is only available when using hardhat rpc');
    return networkConnection.provider.send('evm_revert', [snapshotId]);
}

export function print(message: any): void {
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}

export function describeWithMulticall(fn: (multicall: Multicall | undefined) => any) {
    if (process.env.DISABLE_TEST_WITH_MULTICALL !== '1') {
        describe('with multicall', () => fn(currentConfig.multicall));
    }
    if (process.env.DISABLE_TEST_WITHOUT_MULTICALL !== '1') {
        describe('without multicall', () => fn(undefined));
    }
}
