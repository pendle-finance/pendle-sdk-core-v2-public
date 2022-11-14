import { JsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
import { CHAIN_ID_MAPPING, Multicall, Address, toAddress } from '../../src';
import './bigNumberMatcher';

import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import FUJI_QIUSDC_FEB03_MARKET_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market-QI-USDC-FEB-2ND.json';
import FUJI_QIWETH_DEC01_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market-QI-WETH-DEC-1ST.json';

import FUJI_TEST_ENV from '@pendle/core-v2/deployments/43113-testenv.json';
import { evm_revert, evm_snapshot } from './testHelper';

config();

type TestChainId = typeof CHAIN_ID_MAPPING.FUJI;

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
    [CHAIN_ID_MAPPING.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID_MAPPING.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
};

export const provider = new JsonRpcProvider(
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

type ShallowToAddressType<T> = T extends string
    ? Address
    : T extends {}
    ? { [Key in keyof T]: ShallowToAddressType<T[Key]> }
    : T;

function shallowToAddress<T>(obj: T): ShallowToAddressType<T> {
    if (typeof obj === 'string') {
        return toAddress(obj) as any;
    }
    if (Array.isArray(obj)) {
        return obj.map(shallowToAddress) as any;
    }
    if (typeof obj !== 'object') {
        return obj as any;
    }
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as {})) {
        res[key] = shallowToAddress(value);
    }
    return res as any;
}

export const CONTRACT_ADDRESSES = shallowToAddress({
    [CHAIN_ID_MAPPING.FUJI]: {
        CORE: {
            DEPLOYER: FUJI_CORE_ADDRESSES.deployer,
            MARKET_FACTORY: FUJI_CORE_ADDRESSES.marketFactory,
            YT_FACTORY: FUJI_CORE_ADDRESSES.yieldContractFactory,
            ROUTER: FUJI_CORE_ADDRESSES.router,
            ROUTER_STATIC: FUJI_CORE_ADDRESSES.routerStatic,
            VE: FUJI_CORE_ADDRESSES.vePendle,
            VOTING_CONTROLLER: FUJI_CORE_ADDRESSES.votingController,
            PENDLE: FUJI_CORE_ADDRESSES.PENDLE,
            PENDLE_TREASURY: FUJI_CORE_ADDRESSES.treasury,
        },
        BENQI: {
            FUND_KEEPER: FUJI_TEST_ENV.tokens.fundKeeper,
            FAUCET: FUJI_TEST_ENV.tokens.faucet,
            MARKETS: [
                {
                    ...FUJI_QIUSDC_FEB03_MARKET_ADDRESSES,
                    token: FUJI_TEST_ENV.tokens.qiUSDC,
                },
                {
                    ...FUJI_QIWETH_DEC01_ADDRESSES,
                    token: FUJI_TEST_ENV.tokens.qiWETH,
                },
            ],
        },
        TOKENS: FUJI_TEST_ENV.tokens,
    },
} as const);

// choose the markets you want to test here
// 0n fuji: 0 for (qiUSDC Feb 03), 1 for (qiWETH Dec 01)
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
    fundKeeper: CONTRACT_ADDRESSES[chainId].BENQI.FUND_KEEPER,
    faucet: CONTRACT_ADDRESSES[chainId].BENQI.FAUCET,
    pendleTreasury: CONTRACT_ADDRESSES[chainId].CORE.PENDLE_TREASURY,
    tokens: CONTRACT_ADDRESSES[chainId].TOKENS,
    markets: CONTRACT_ADDRESSES[chainId].BENQI.MARKETS,

    // TODO remove ! since MUMBAI does not has any market
    market: CONTRACT_ADDRESSES[chainId].BENQI.MARKETS[MARKET_TO_TEST]!,
    marketAddress: CONTRACT_ADDRESSES[chainId].BENQI.MARKETS[MARKET_TO_TEST]!.market,
    // choose the token to test for swap from raw token -> py
    tokenToSwap: CONTRACT_ADDRESSES[chainId].TOKENS.USDT,

    userAddress: signerAddress,
    multicall: new Multicall({
        chainId,
        provider: networkConnection.provider,
    }),
});

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);
