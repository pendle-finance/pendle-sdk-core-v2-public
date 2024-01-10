import { PendleERC20 } from '@pendle/core-v2/typechain-types';
import { BigNumber as BN, BigNumberish, Signer, ethers } from 'ethers';
import { ERC20Entity, Address, MarketEntity, WrappedContract, isNativeToken } from '../../src';
import { networkConnection, networkConnectionWithChainId, BLOCK_CONFIRMATION, currentConfig } from './testEnv';
import * as iters from 'itertools';
import * as pendleSDK from '../../src';
import { TokenData } from './marketData';

export const NATIVE_TOKEN_0x00: TokenData = {
    name: 'native token',
    address: pendleSDK.NATIVE_ADDRESS_0x00,
    decimals: 18,
    disableTesting: false,
};

type EntitiesMapType = {
    [entity: Address]: WrappedContract<PendleERC20>;
};

const TOKEN_NAME_CACHE: Map<string, string> = new Map();

const ERC20_CREATE_HANDLER = {
    get: function (target: Partial<EntitiesMapType>, address: Address) {
        if (target[address] === undefined) {
            target[address] = new ERC20Entity(address, {
                ...networkConnection,
                multicall: currentConfig.multicall,
            }).contract;
        }
        return target[address];
    },
};

const ERC20_ENTITIES = new Proxy({}, ERC20_CREATE_HANDLER) as EntitiesMapType;

export async function getBalance(token: Address, user: Address): Promise<BN> {
    if (isNativeToken(token)) {
        return networkConnection.provider.getBalance(user);
    }
    return ERC20_ENTITIES[token].balanceOf(user);
}

export async function getUserBalances(userAddress: Address, tokens: Address[]): Promise<BN[]> {
    return Promise.all(tokens.map((token) => getBalance(token, userAddress)));
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
        return ethers.constants.MaxUint256;
    }
    return ERC20_ENTITIES[token].allowance(user, spender);
}

export async function approve(
    token: Address,
    spender: Address,
    amount: BigNumberish,
    params?: {
        signer?: ethers.Signer;
    }
) {
    const { signer } = params ?? {};
    if (isNativeToken(token)) {
        return;
    }
    const contract = ERC20_ENTITIES[token];
    const connectedContract = signer ? contract.connect(signer) : contract;
    return connectedContract.approve(spender, amount).then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export async function approveInf(token: Address, user: Address) {
    return approve(token, user, ethers.constants.MaxUint256);
}

export async function batchApprove(
    approvalParams: Iterable<{ token: Address; spender: Address; amount?: BigNumberish }>,
    params?: {
        signer?: ethers.Signer;
    }
) {
    const { signer = networkConnection.signer } = params ?? {};
    const nonce = await signer.getTransactionCount();
    const filteredApprovalParams = iters.ifilter(approvalParams, ({ token }) => !isNativeToken(token));
    const transactions = await Promise.all(
        iters.map(iters.zip(filteredApprovalParams, iters.count()), ([{ token, spender, amount }, index]) =>
            ERC20_ENTITIES[token]
                .connect(signer)
                .approve(spender, amount ?? ethers.constants.MaxUint256, { nonce: nonce + index })
                .then((tx) => tx.wait(BLOCK_CONFIRMATION))
        )
    );
    return iters.zip(filteredApprovalParams, transactions);
}

export async function transfer(token: Address, user: Address, amount: BN, signer?: Signer) {
    await ERC20_ENTITIES[token]
        .connect(signer ?? networkConnection.signer)
        .transfer(user, amount)
        .then((tx) => tx.wait(BLOCK_CONFIRMATION));
}

export async function getERC20Name(token: Address): Promise<string> {
    if (isNativeToken(token)) {
        return `Native ${token}`;
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

export function getTokenBalancesBeforeTesting(
    owner: pendleSDK.Address,
    tokenAddresses: Iterable<pendleSDK.Address>
): Record<pendleSDK.Address, pendleSDK.BN> {
    const res: Record<pendleSDK.Address, pendleSDK.BN> = {};
    beforeAll(async () => {
        await Promise.all(
            iters.map(tokenAddresses, async (tokenAddress) => {
                const balance = await getBalance(tokenAddress, owner);
                res[tokenAddress] = balance;
            })
        );
    });

    return res;
}

export async function stalkAccount(user: Address, markets: any[]) {
    /* eslint-disable no-console */
    for (const market of markets) {
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
    /* eslint-enable no-console */
}
