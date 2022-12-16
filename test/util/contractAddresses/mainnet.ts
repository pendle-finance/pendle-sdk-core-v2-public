import MAINNET_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-core.json';
import MAINNET_FRAX_MAR23_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/FRAXUSDC-CURVELP-MARCH30.json';
import MAINNET_LOOKS_MAR23_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/LOOKS-STAKING-MARCH30.json';
import MAINNET_STETH_MAR30_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/STETH-MARCH30.json';
import MAINNET_STETH_JUN29_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/STETH-JUNE29.json';

import { DUMMY_ADDRESS } from '../constants';
import { shallowToAddress } from './helper';

export const MAINNET_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: MAINNET_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: MAINNET_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: MAINNET_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: MAINNET_CORE_ADDRESSES.router,
        ROUTER_STATIC: MAINNET_CORE_ADDRESSES.routerStatic,
        VE: MAINNET_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: MAINNET_CORE_ADDRESSES.votingController,
        PENDLE: MAINNET_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [
        MAINNET_FRAX_MAR23_ADDRESSES,
        MAINNET_LOOKS_MAR23_ADDRESSES,
        MAINNET_STETH_MAR30_ADDRESSES,
        MAINNET_STETH_JUN29_ADDRESSES,
    ],
    MARKETS_BY_NAME: {
        MAINNET_FRAX_MAR23_ADDRESSES,
        MAINNET_LOOKS_MAR23_ADDRESSES,
        MAINNET_STETH_MAR30_ADDRESSES,
        MAINNET_STETH_JUN29_ADDRESSES,
    },
    FUND_KEEPER: DUMMY_ADDRESS,
    FAUCET: DUMMY_ADDRESS,
    TOKENS: {
        USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
        WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    },
} as const);
