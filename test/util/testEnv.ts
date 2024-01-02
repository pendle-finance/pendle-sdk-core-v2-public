import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet, providers, ethers } from 'ethers';
import {
    CHAIN_ID_MAPPING,
    Multicall,
    toAddress,
    KyberSwapAggregatorHelper,
    BaseRouterConfig,
    GasFeeEstimator,
    BN,
    ChainId,
    VoidAggregatorHelper,
    OneInchAggregatorHelper,
    AggregatorHelper,
    Address,
} from '../../src';
import './bigNumberMatcher';
import { CONTRACT_ADDRESSES } from './contractAddresses';
import { TEST_ENV_SCHEMA } from './testEnvSchema';
import * as marketData from './marketData';
import * as zappableTokens from './zappableTokens';

config();
export const env = TEST_ENV_SCHEMA.parse(process.env);

// Change this to the current active network
export const ACTIVE_CHAIN_ID = env.ACTIVE_CHAIN_ID;
const LOCAL_CHAIN_ID = 31337;
export const USE_HARDHAT_RPC = env.USE_LOCAL;

export const AMOUNT_TO_TEST_IN_USD = env.AMOUNT_TO_TEST_IN_USD;

export const BLOCK_CONFIRMATION = USE_HARDHAT_RPC ? 1 : env.BLOCK_CONFIRMATION;

const INFURA_PROJECT_ID = env.INFURA_PROJECT_ID;

const providerUrls = {
    [CHAIN_ID_MAPPING.ETHEREUM]: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
    [CHAIN_ID_MAPPING.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [CHAIN_ID_MAPPING.BSC]: 'https://bsc-dataseed.binance.org',
    [CHAIN_ID_MAPPING.ARBITRUM]: 'https://endpoints.omniatech.io/v1/arbitrum/one/public',
    [CHAIN_ID_MAPPING.MANTLE]: 'https://rpc.mantle.xyz',
    [CHAIN_ID_MAPPING.OPTIMISM]: 'https://endpoints.omniatech.io/v1/op/mainnet/public',
    [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
} as const satisfies Record<ChainId | typeof LOCAL_CHAIN_ID, string>;

export const provider = new StaticJsonRpcProvider(
    USE_HARDHAT_RPC ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]
);
export const wallet = new Wallet(env.PRIVATE_KEY).connect(provider);

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

class ConstantGasFeeEstimator extends GasFeeEstimator {
    constructor(readonly constGasFee: BN, readonly provider: providers.Provider) {
        super(provider);
    }

    override async getGasFee(): Promise<BN> {
        return this.constGasFee;
    }
}

export function getAggregatorHelper(chainId: ChainId): AggregatorHelper {
    switch (env.AGGREGATOR_HELPER) {
        case 'KYBERSWAP': {
            const contractAddresses = CONTRACT_ADDRESSES[chainId];
            const router = contractAddresses.CORE.ROUTER;
            return new KyberSwapAggregatorHelper(router, networkConnectionWithChainId);
        }
        case 'VOID': {
            return new VoidAggregatorHelper();
        }
        case 'ONEINCH': {
            return new OneInchAggregatorHelper({
                chainId,
                apiUrl: env.AGGREGATOR_ENDPOINT,
            });
        }
    }
}

export const testConfig = (chainId: ChainId) => {
    const contractAddresses = CONTRACT_ADDRESSES[chainId];
    const router = contractAddresses.CORE.ROUTER;
    const aggregatorHelper = getAggregatorHelper(chainId);
    const routerConfig: BaseRouterConfig = {
        ...networkConnectionWithChainId,
        aggregatorHelper,
        gasFeeEstimator: new ConstantGasFeeEstimator(
            BN.from(10).pow(/* gwei decimal = */ 9).mul(25),
            networkConnectionWithChainId.provider
        ),
    };

    const currentMarketData = marketData.lookup(env.MARKET_ADDRESS, chainId, env.EXCLUDE_SY_IO_TOKENS);

    const unfilteredZappableTokensToTest = zappableTokens.lookup(chainId, !env.INCLUDE_PENDLE_BACKEND_ZAPPABLE_TOKENS);
    const zappableTokensToTest = unfilteredZappableTokensToTest.filter(({ disableTesting }) => !disableTesting);

    return {
        chainId,
        deployer: contractAddresses.CORE.DEPLOYER,
        marketFactory: contractAddresses.CORE.MARKET_FACTORY,
        router,
        routerStatic: contractAddresses.CORE.ROUTER_STATIC,
        yieldContractFactory: contractAddresses.CORE.YT_FACTORY,
        veAddress: contractAddresses.CORE.VE,
        votingController: contractAddresses.CORE.VOTING_CONTROLLER,
        feeDistributer: contractAddresses.CORE.FEE_DISTRIBUTOR,
        pendle: contractAddresses.CORE.PENDLE,
        fundKeeper: contractAddresses.FUND_KEEPER,
        faucet: contractAddresses.FAUCET,
        tokens: contractAddresses.TOKENS,
        markets: contractAddresses.MARKETS,

        market: currentMarketData,
        marketAddress: currentMarketData.marketAddress,
        // choose the token to test for swap from raw token -> py
        tokenToSwap: contractAddresses.TOKENS.USDT,

        userAddress: signerAddress,
        multicall: Multicall.create({
            chainId,
            provider: networkConnection.provider,
        }),
        aggregatorHelper,
        routerConfig,
        zappableTokensToTest,
        unfilteredZappableTokensToTest,
    };
};

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);

export async function setBalance(userAddress: Address, amount: BN, _provider: providers.JsonRpcProvider = provider) {
    await _provider.send('hardhat_setBalance', [userAddress, ethers.utils.hexValue(amount)]);
}

// set balances of default signer for gas
