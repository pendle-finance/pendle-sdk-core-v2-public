import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import APE_MARCH30_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/APE-30-MARCH.json';
import USDC_FEB02_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/USDC-FEB-2ND.json';
import USDC_FEB04_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/USDC-FEB-4TH.json';
import USDC_MAR28_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/USDC-MAR-28TH.json';
import WETH_FEB02_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/WETH-FEB-2ND.json';
import WETH_FEB04_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/WETH-FEB-4TH.json';
import USDC_FEB02_2024_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/USDC-FEB-2ND-2024.json';

import FUJI_TEST_ENV from '@pendle/core-v2-testnet/deployments/43113-testenv.json';

import { shallowToAddress } from './helper';

export const FUJI_TESTNET_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: FUJI_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: FUJI_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: FUJI_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: FUJI_CORE_ADDRESSES.router,
        ROUTER_STATIC: FUJI_CORE_ADDRESSES.routerStatic,
        VE: FUJI_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: FUJI_CORE_ADDRESSES.votingController,
        FEE_DISTRIBUTOR: FUJI_CORE_ADDRESSES.feeDistributor,
        PENDLE: FUJI_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [
        APE_MARCH30_ADDRESSES,
        USDC_FEB02_ADDRESSES,
        USDC_FEB04_ADDRESSES,
        USDC_MAR28_ADDRESSES,
        WETH_FEB02_ADDRESSES,
        WETH_FEB04_ADDRESSES,
        USDC_FEB02_2024_ADDRESSES,
    ],
    MARKETS_BY_NAME: {
        APE_MARCH30_ADDRESSES,
        USDC_FEB02_ADDRESSES,
        USDC_FEB04_ADDRESSES,
        USDC_MAR28_ADDRESSES,
        WETH_FEB02_ADDRESSES,
        WETH_FEB04_ADDRESSES,
        USDC_FEB02_2024_ADDRESSES,
    },
    FUND_KEEPER: FUJI_TEST_ENV.tokens.fundKeeper,
    FAUCET: FUJI_TEST_ENV.tokens.faucet,
    TOKENS: FUJI_TEST_ENV.tokens,
} as const);
