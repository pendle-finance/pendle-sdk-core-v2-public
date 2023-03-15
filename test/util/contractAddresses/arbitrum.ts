import ARBITRUM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/42161-core.json';
import ARBITRUM_GLP_MAR28_2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/42161-markets/GLP-28MARCH2024.json';
import ARBITRUM_GDAI_MAR28_2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/42161-markets/GDAI-28MARCH2024.json';

import { DUMMY_ADDRESS } from '../constants';
import { shallowToAddress } from './helper';

export const ARBITRUM_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: ARBITRUM_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: ARBITRUM_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: ARBITRUM_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: ARBITRUM_CORE_ADDRESSES.router,
        ROUTER_STATIC: ARBITRUM_CORE_ADDRESSES.routerStatic,
        VE: ARBITRUM_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: DUMMY_ADDRESS,
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: ARBITRUM_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [ARBITRUM_GLP_MAR28_2024_ADDRESSES, ARBITRUM_GDAI_MAR28_2024_ADDRESSES],
    MARKETS_BY_NAME: { ARBITRUM_GLP_MAR28_2024_ADDRESSES, ARBITRUM_GDAI_MAR28_2024_ADDRESSES },
    FUND_KEEPER: DUMMY_ADDRESS,
    FAUCET: DUMMY_ADDRESS,
    TOKENS: {
        USDC: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
        USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
        WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    },
} as const);
