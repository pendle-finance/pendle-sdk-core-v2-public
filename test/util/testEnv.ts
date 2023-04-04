import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { Wallet, providers } from 'ethers';
import {
    CHAIN_ID_MAPPING,
    Multicall,
    toAddress,
    KyberSwapAggregatorHelper,
    BaseRouterConfig,
    GasFeeEstimator,
    BN,
} from '../../src';
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

const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID ?? '<please specify INFURA_PROJECT_ID in .env>';

const providerUrls = {
    [CHAIN_ID_MAPPING.ETHEREUM]: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
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

class ConstantGasFeeEstimator extends GasFeeEstimator {
    constructor(readonly constGasFee: BN, readonly provider: providers.Provider) {
        super(provider);
    }

    override async getGasFee(): Promise<BN> {
        return this.constGasFee;
    }
}

export const testConfig = (chainId: TestChainId) => {
    const contractAddresses = CONTRACT_ADDRESSES[chainId];
    const router = contractAddresses.CORE.ROUTER;
    const aggregatorHelper = new KyberSwapAggregatorHelper(router, networkConnectionWithChainId);
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
