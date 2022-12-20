import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
import { CHAIN_ID_MAPPING, Multicall, toAddress } from '../../src';
import './bigNumberMatcher';

import { evm_revert, evm_snapshot } from './testHelper';

import { CONTRACT_ADDRESSES, MARKET_TO_TEST } from './contractAddresses';

config();

type TestChainId = typeof CHAIN_ID_MAPPING.FUJI | typeof CHAIN_ID_MAPPING.ETHEREUM | typeof CHAIN_ID_MAPPING.MUMBAI;

// Change this to the current active network
export const ACTIVE_CHAIN_ID = Number(process.env.ACTIVE_CHAIN_ID!) as TestChainId;
const LOCAL_CHAIN_ID = 31337;
export const USE_HARDHAT_RPC = process.env.USE_LOCAL === '1';

export function describeWrite(...params: [fn: () => void] | [name: string, fn: () => void]) {
    let name = 'Write function';
    let fn: () => void;

    if (params.length === 1) {
        [fn] = params;
    } else {
        [name, fn] = params;
    }

    const fnWithSnapshot = () => {
        let globalSnapshotId = '';

        beforeAll(async () => {
            globalSnapshotId = await evm_snapshot();
        });

        afterAll(async () => {
            await evm_revert(globalSnapshotId);
        });

        fn();
    };

    (process.env.INCLUDE_WRITE === '1' && USE_HARDHAT_RPC ? describe : describe.skip)(name, fnWithSnapshot);
}

export function describeIf(condition: boolean, ...params: [fn: () => void] | [name: string, fn: () => void]) {
    let name = 'Write function';
    let fn: () => void;

    if (params.length === 1) {
        [fn] = params;
    } else {
        [name, fn] = params;
    }

    (condition ? describe : describe.skip)(name, fn);
}

export const BLOCK_CONFIRMATION = USE_HARDHAT_RPC ? 1 : parseInt(process.env.BLOCK_CONFIRMATION ?? '1');

const providerUrls = {
    [CHAIN_ID_MAPPING.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID_MAPPING.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
};

export const provider = new StaticJsonRpcProvider(
    USE_HARDHAT_RPC ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]
);
export const wallet = (
    process.env.PRIVATE_KEY ? new Wallet(process.env.PRIVATE_KEY!) : Wallet.fromMnemonic('test '.repeat(11) + 'junk')
).connect(provider);

export const signer = wallet;
export const signerAddress = toAddress(signer.address);

export const networkConnection = {
    provider,
    signer,
    signerAddress,
} as const;

export const networkConnectionWithChainId = {
    ...networkConnection,
    chainId: ACTIVE_CHAIN_ID,
};

export const testConfig = (chainId: TestChainId) => ({
    chainId,
    deployer: CONTRACT_ADDRESSES[chainId].CORE.DEPLOYER,
    marketFactory: CONTRACT_ADDRESSES[chainId].CORE.MARKET_FACTORY,
    router: CONTRACT_ADDRESSES[chainId].CORE.ROUTER,
    routerStatic: CONTRACT_ADDRESSES[chainId].CORE.ROUTER_STATIC,
    yieldContractFactory: CONTRACT_ADDRESSES[chainId].CORE.YT_FACTORY,
    veAddress: CONTRACT_ADDRESSES[chainId].CORE.VE,
    votingController: CONTRACT_ADDRESSES[chainId].CORE.VOTING_CONTROLLER,
    pendle: CONTRACT_ADDRESSES[chainId].CORE.PENDLE,
    fundKeeper: CONTRACT_ADDRESSES[chainId].FUND_KEEPER,
    faucet: CONTRACT_ADDRESSES[chainId].FAUCET,
    tokens: CONTRACT_ADDRESSES[chainId].TOKENS,
    markets: CONTRACT_ADDRESSES[chainId].MARKETS,

    market: MARKET_TO_TEST[chainId],
    marketAddress: MARKET_TO_TEST[chainId].market,
    // choose the token to test for swap from raw token -> py
    tokenToSwap: CONTRACT_ADDRESSES[chainId].TOKENS.USDT,

    userAddress: signerAddress,
    multicall: new Multicall({
        chainId,
        provider: networkConnection.provider,
    }),
});

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);
