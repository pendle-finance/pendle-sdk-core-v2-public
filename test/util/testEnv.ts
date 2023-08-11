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
import { evm_revert, evm_snapshot } from './testHelper';
import { CONTRACT_ADDRESSES, MARKET_TO_TEST } from './contractAddresses';
import { TEST_ENV_SCHEMA } from './testEnvSchema';

config();
export const env = TEST_ENV_SCHEMA.parse(process.env);

// Change this to the current active network
export const ACTIVE_CHAIN_ID = env.ACTIVE_CHAIN_ID;
const LOCAL_CHAIN_ID = 31337;
export const USE_HARDHAT_RPC = env.USE_LOCAL;

export const AMOUNT_TO_TEST_IN_USD = env.AMOUNT_TO_TEST_IN_USD;

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

    (env.INCLUDE_WRITE && USE_HARDHAT_RPC ? describe : describe.skip)(name, fnWithSnapshot);
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

export const BLOCK_CONFIRMATION = USE_HARDHAT_RPC ? 1 : env.BLOCK_CONFIRMATION;

const INFURA_PROJECT_ID = env.INFURA_PROJECT_ID;

const providerUrls = {
    [CHAIN_ID_MAPPING.ETHEREUM]: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
    [CHAIN_ID_MAPPING.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [CHAIN_ID_MAPPING.BSC]: 'https://bsc-dataseed.binance.org',
    [CHAIN_ID_MAPPING.ARBITRUM]: 'https://endpoints.omniatech.io/v1/arbitrum/one/public',
    [CHAIN_ID_MAPPING.MANTLE]: 'https://rpc.mantle.xyz',
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

        market: MARKET_TO_TEST[chainId],
        marketAddress: MARKET_TO_TEST[chainId].market,
        // choose the token to test for swap from raw token -> py
        tokenToSwap: contractAddresses.TOKENS.USDT,

        userAddress: signerAddress,
        multicall: new Multicall({
            chainId,
            provider: networkConnection.provider,
        }),
        aggregatorHelper,
        routerConfig,
    };
};

export const currentConfig = testConfig(ACTIVE_CHAIN_ID);

export async function setBalance(userAddress: Address, amount: BN, _provider: providers.JsonRpcProvider = provider) {
    await _provider.send('hardhat_setBalance', [userAddress, ethers.utils.hexValue(amount)]);
}

// set balances of default signer for gas
