import BSC_CORE_ADDRESSES from '@pendle/core-v2/deployments/56-core.json';
import THENA_FRXETH_ETH_JUNE2024 from '@pendle/core-v2/deployments/56-markets/THENA-FRXETH-ETH-JUNE2024.json';
import WBETH_DEC_2024 from '@pendle/core-v2/deployments/56-markets/WBETH-DEC2024.json';

import { DUMMY_ADDRESS } from '../constants';
import { shallowToAddress } from './helper';

export const BSC_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: BSC_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: BSC_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: BSC_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: BSC_CORE_ADDRESSES.router,
        ROUTER_STATIC: BSC_CORE_ADDRESSES.routerStatic,
        VE: BSC_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: DUMMY_ADDRESS,
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: BSC_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [THENA_FRXETH_ETH_JUNE2024, WBETH_DEC_2024],
    MARKETS_BY_NAME: { THENA_FRXETH_ETH_JUNE2024, WBETH_DEC_2024 },
    FUND_KEEPER: DUMMY_ADDRESS,
    FAUCET: DUMMY_ADDRESS,
    TOKENS: {
        USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        USDT: '0x0a70ddf7cdba3e8b6277c9ddcaf2185e8b6f539f',
        DAI: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
        WETH: '0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea',
    },
} as const);
