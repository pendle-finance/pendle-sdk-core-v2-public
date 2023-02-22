import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-core.json';
import MUMBAI_QIUSDC_FEB04_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-markets/USDC-FEB-4TH.json';
import MUMBAI_QIWETH_FEB04_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-markets/WETH-FEB-4TH.json';
import MUMBAI_QIUSDC_DEC08_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-markets/USDC-DEC-8TH.json';
import MUMBAI_GLP_DEC08_ADDRESSES from '@pendle/core-v2-testnet/deployments/80001-markets/GLP-DEC-8TH.json';

import MUMBAI_TEST_ENV from '@pendle/core-v2-testnet/deployments/80001-testenv.json';

import { shallowToAddress } from './helper';
import { DUMMY_ADDRESS } from '../constants';

export const MUMBAI_TESTNET_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: MUMBAI_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: MUMBAI_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: MUMBAI_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: MUMBAI_CORE_ADDRESSES.router,
        ROUTER_STATIC: MUMBAI_CORE_ADDRESSES.routerStatic,
        VE: MUMBAI_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: DUMMY_ADDRESS,
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: MUMBAI_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [
        MUMBAI_QIUSDC_FEB04_ADDRESSES,
        MUMBAI_QIWETH_FEB04_ADDRESSES,
        MUMBAI_QIUSDC_DEC08_ADDRESSES,
        MUMBAI_GLP_DEC08_ADDRESSES,
    ],
    MARKETS_BY_NAME: {
        MUMBAI_QIUSDC_FEB04_ADDRESSES,
        MUMBAI_QIWETH_FEB04_ADDRESSES,
        MUMBAI_QIUSDC_DEC08_ADDRESSES,
        MUMBAI_GLP_DEC08_ADDRESSES,
    },
    FUND_KEEPER: MUMBAI_TEST_ENV.tokens.fundKeeper,
    FAUCET: MUMBAI_TEST_ENV.tokens.faucet,
    TOKENS: MUMBAI_TEST_ENV.tokens,
} as const);
