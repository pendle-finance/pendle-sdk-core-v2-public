import { JsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
import { CHAIN_ID, Multicall } from '../../src';
import './bigNumberMatcher';

import MAINNET_CORE_ADDRESSES from '@pendle/core-v2/deployments/1-core.json';
import MAINNET_FRAX_MAR23_ADDRESSES from '@pendle/core-v2/deployments/1-markets/FRAX_30_MAR_23.json';
import MAINNET_LOOKS_MAR23_ADDRESSES from '@pendle/core-v2/deployments/1-markets/LOOKS_30_MAR_23.json';
import MAINNET_STERH_MAR30_ADDRESSES from '@pendle/core-v2/deployments/1-markets/STETH_MARCH_30.json';
import MAINNET_USDD_MAR30_ADDRESSES from '@pendle/core-v2/deployments/1-markets/USDD_MARCH_30.json';

import { evm_revert, evm_snapshot } from './testHelper';
import { DUMMY_ADDRESS } from './constants';

config();

type TestChainId = typeof CHAIN_ID.ETHEREUM;

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

export const BLOCK_CONFIRMATION = USE_HARDHAT_RPC ? 1 : parseInt(process.env.BLOCK_CONFIRMATION ?? '1');

const providerUrls = {
    [CHAIN_ID.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
};

export const networkConnection = {
    provider: new JsonRpcProvider(USE_HARDHAT_RPC ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]),
    get signer() {
        return WALLET().wallet; // this.provider.getSigner();
    },
} as const;

export const CONTRACT_ADDRESSES = {
    [CHAIN_ID.ETHEREUM]: {
        CORE: {
            DEPLOYER: MAINNET_CORE_ADDRESSES.deployer,
            MARKET_FACTORY: MAINNET_CORE_ADDRESSES.marketFactory,
            YT_FACTORY: MAINNET_CORE_ADDRESSES.yieldContractFactory,
            ROUTER: MAINNET_CORE_ADDRESSES.router,
            ROUTER_STATIC: MAINNET_CORE_ADDRESSES.routerStatic,
            VE: MAINNET_CORE_ADDRESSES.vePendle,
            VOTING_CONTROLLER: MAINNET_CORE_ADDRESSES.votingController,
            PENDLE: MAINNET_CORE_ADDRESSES.PENDLE,
            PENDLE_TREASURY: MAINNET_CORE_ADDRESSES.treasury,
        },
        MARKETS: [
            MAINNET_FRAX_MAR23_ADDRESSES,
            MAINNET_LOOKS_MAR23_ADDRESSES,
            MAINNET_STERH_MAR30_ADDRESSES,
            MAINNET_USDD_MAR30_ADDRESSES,
        ],
        TOKENS: {
            USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
            WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        },
    },
} as const;

export const WALLET = () => ({
    wallet: (process.env.PRIVATE_KEY
        ? new Wallet(process.env.PRIVATE_KEY!)
        : Wallet.fromMnemonic('test '.repeat(11) + 'junk')
    ).connect(networkConnection.provider),
});

// choose the markets you want to test here
const MARKET_TO_TEST = 0;

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
    fundKeeper: DUMMY_ADDRESS,
    faucet: DUMMY_ADDRESS,
    pendleTreasury: CONTRACT_ADDRESSES[chainId].CORE.PENDLE_TREASURY,
    tokens: CONTRACT_ADDRESSES[chainId].TOKENS,
    markets: CONTRACT_ADDRESSES[chainId].MARKETS,

    // TODO remove ! since MUMBAI does not has any market
    market: CONTRACT_ADDRESSES[chainId].MARKETS[MARKET_TO_TEST]!,
    marketAddress: CONTRACT_ADDRESSES[chainId].MARKETS[MARKET_TO_TEST]!.market,
    // choose the token to test for swap from raw token -> py
    tokenToSwap: CONTRACT_ADDRESSES[chainId].TOKENS.USDT,

    userAddress: WALLET().wallet.address,
    multicall: new Multicall({
        chainId,
        provider: networkConnection.provider,
    }),
});

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);
