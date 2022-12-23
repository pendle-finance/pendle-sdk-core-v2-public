import FUJI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-core.json';
import FUJI_QIUSDC_FEB02_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/USDC-FEB-2ND.json';
import FUJI_QIWETH_DEC01_ADDRESSES from '@pendle/core-v2-testnet/deployments/43113-markets/WETH-FEB-2ND.json';

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
    MARKETS: [FUJI_QIUSDC_FEB02_ADDRESSES, FUJI_QIWETH_DEC01_ADDRESSES],
    MARKETS_BY_NAME: {
        FUJI_QIUSDC_FEB02_ADDRESSES,
        FUJI_QIWETH_DEC01_ADDRESSES,
    },
    FUND_KEEPER: FUJI_TEST_ENV.tokens.fundKeeper,
    FAUCET: FUJI_TEST_ENV.tokens.faucet,
    TOKENS: FUJI_TEST_ENV.tokens,
} as const);
