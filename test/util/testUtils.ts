import { JsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
import { inspect } from 'util';
import { type NetworkConnection, CHAIN_ID } from '../../src';

import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import FUJI_QIUSDC_MARKET_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market-35237d.json';
import FUJI_QIWETH_MARKET_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market-438DAA.json';
import FUJI_QIWAVAX_MARKET_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market-a45e40.json';

import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';
import MUMBAI_QIAVAX_BENQI_ADDRESSES from '@pendle/core-v2/deployments/80001-markets/benqi-market-b61e7f.json';
import MUMBAI_QIUSDC_BENQI_ADDRESSES from '@pendle/core-v2/deployments/80001-markets/benqi-market-3b8BD1.json';

import FUJI_TEST_ENV from '@pendle/core-v2/deployments/43113-testenv.json';
import MUMBAI_TEST_ENV from '@pendle/core-v2/deployments/80001-testenv.json';

config();

// Change this to the current active network
export const ACTIVE_CHAIN_ID = Number(process.env.ACTIVE_CHAIN_ID!);
const LOCAL_CHAIN_ID = 31337;
const USE_LOCAL = process.env.USE_LOCAL === '1';

export const describeWrite = (fn: () => any) =>
    (process.env.INCLUDE_WRITE === '1' ? describe : describe.skip)('Write functions', fn);

export const BLOCK_CONFIRMATION = USE_LOCAL ? 1 : parseInt(process.env.BLOCK_CONFIRMATION ?? '1');

const providerUrls = {
    [CHAIN_ID.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://localhost:8545',
};

export const networkConnection: NetworkConnection = {
    provider: new JsonRpcProvider(USE_LOCAL ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]),
    get signer() {
        return WALLET().wallet; // this.provider.getSigner();
    },
};

export const CONTRACT_ADDRESSES = {
    [CHAIN_ID.FUJI]: {
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
                    ...FUJI_QIUSDC_MARKET_ADDRESSES,
                    token: FUJI_TEST_ENV.tokens.qiUSDC,
                },
                {
                    ...FUJI_QIWAVAX_MARKET_ADDRESSES,
                    token: FUJI_TEST_ENV.tokens.qiAVAX,
                },
                {
                    ...FUJI_QIWETH_MARKET_ADDRESSES,
                    token: FUJI_TEST_ENV.tokens.qiWETH,
                },
            ],
        },
        TOKENS: FUJI_TEST_ENV.tokens,
    },
    [CHAIN_ID.MUMBAI]: {
        CORE: {
            DEPLOYER: MUMBAI_CORE_ADDRESSES.deployer,
            MARKET_FACTORY: MUMBAI_CORE_ADDRESSES.marketFactory,
            YT_FACTORY: MUMBAI_CORE_ADDRESSES.yieldContractFactory,
            ROUTER: MUMBAI_CORE_ADDRESSES.router,
            ROUTER_STATIC: MUMBAI_CORE_ADDRESSES.routerStatic,
            VE: MUMBAI_CORE_ADDRESSES.vePendle,
            PENDLE: MUMBAI_CORE_ADDRESSES.PENDLE,
            PENDLE_TREASURY: MUMBAI_CORE_ADDRESSES.treasury,
        },
        BENQI: {
            FUND_KEEPER: MUMBAI_TEST_ENV.tokens.fundKeeper,
            FAUCET: MUMBAI_TEST_ENV.tokens.faucet,
            MARKETS: [
                // Ignore for now since markets on Mumbai are out-synced
                {
                    ...MUMBAI_QIAVAX_BENQI_ADDRESSES,
                    token: MUMBAI_TEST_ENV.tokens.qiAVAX,
                },
                {
                    ...MUMBAI_QIUSDC_BENQI_ADDRESSES,
                    token: MUMBAI_TEST_ENV.tokens.qiUSDC,
                },
            ],
        },
        TOKENS: MUMBAI_TEST_ENV.tokens,
    },
};

export const testConfig = (chainId: number) => ({
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

    // choose the markets you want to test here
    market: CONTRACT_ADDRESSES[chainId].BENQI.MARKETS[0],
    marketAddress: CONTRACT_ADDRESSES[chainId].BENQI.MARKETS[0].market,
    // choose the token to test for swap from raw token -> py
    tokenToSwap: CONTRACT_ADDRESSES[chainId].TOKENS.USDC,
});

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);

export const WALLET = () => ({
    wallet: new Wallet(process.env.PRIVATE_KEY!).connect(networkConnection.provider),
});

export function print(message: any): void {
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}
