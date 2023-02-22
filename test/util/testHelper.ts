import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, BigNumberish, Signer, ethers } from 'ethers';
import { ERC20Entity, Address, MarketEntity, WrappedContract, bnMin, Multicall, isNativeToken } from '../../src';
import { INF } from './constants';
import {
    networkConnection,
    networkConnectionWithChainId,
    BLOCK_CONFIRMATION,
    USE_HARDHAT_RPC,
    currentConfig,
} from './testEnv';
import { inspect } from 'util';

type EntitiesMapType = {
    [entity: Address]: WrappedContract<PendleERC20>;
};

const TOKEN_NAME_CACHE: Map<string, string> = new Map();

const ERC20_CREATE_HANDLER = {
    get: function (target: EntitiesMapType, address: Address) {
        if (target[address] === undefined) {
            target[address] = new ERC20Entity(address, {
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

export async function transferHelper(token: Address, user: Address, amount: BN, signer?: Signer) {
    await ERC20_ENTITIES[token]
        .connect(signer ?? networkConnection.signer)
        .transfer(user, amount)
        .then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export function bnMinAsBn(a: BigNumberish, b: BigNumberish): BN {
    return BN.from(bnMin(a, b));
}

export async function getERC20Name(token: Address): Promise<string> {
    if (isNativeToken(token)) {
        return 'Native';
    }

    if (TOKEN_NAME_CACHE.has(token)) {
        return TOKEN_NAME_CACHE.get(token)!;
    }

    const name = await ERC20_ENTITIES[token].name();
    TOKEN_NAME_CACHE.set(token, name);
    return name;
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

        const marketEntity = new MarketEntity(market.market, networkConnectionWithChainId);

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

export function itWhen(condition: boolean) {
    if (!condition) return it.skip;
    return it;
}

export async function setERC20Balance(address: string, user: string, value: BN, slot: number, reverse = false) {
    const order = reverse ? [slot, user] : [user, slot];
    const index = ethers.utils.solidityKeccak256(['uint256', 'uint256'], order);
    await networkConnection.provider.send('hardhat_setStorageAt', [
        address,
        index,
        ethers.utils.hexZeroPad(value.toHexString(), 32),
    ]);
}

export async function setPendleERC20Balance(market: string, user: string, value: BN) {
    return setERC20Balance(market, user, value, 0);
}

export async function increaseNativeBalance(userAddress: string) {
    await networkConnection.provider.send('hardhat_setBalance', [
        userAddress,
        // 1e6 ETH
        ethers.utils.hexStripZeros(
            BN.from(10)
                .pow(18 + 6)
                .toHexString()
        ),
    ]);
}

export async function getUserBalances(userAddress: Address, tokens: Address[]): Promise<BN[]> {
    return Promise.all(tokens.map((token) => getBalance(token, userAddress)));
}
