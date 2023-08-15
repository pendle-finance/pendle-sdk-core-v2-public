import OPTIMISM_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/10-core.json';
import RETH_OPTIMISM_JUNE2024 from '@pendle/core-v2-mainnet/deployments/10-markets/RETH-OPTIMISM-JUNE2024.json';
import WSTETH_OPTIMISM_SEP2024 from '@pendle/core-v2-mainnet/deployments/10-markets/WSTETH-OPTIMISM-SEP2024.json';

import { DUMMY_ADDRESS } from '../constants';
import { shallowToAddress } from './helper';

export const OPTIMISM_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: OPTIMISM_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: OPTIMISM_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: OPTIMISM_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: OPTIMISM_CORE_ADDRESSES.router,
        ROUTER_STATIC: OPTIMISM_CORE_ADDRESSES.routerStatic,
        VE: OPTIMISM_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: DUMMY_ADDRESS,
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: OPTIMISM_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [RETH_OPTIMISM_JUNE2024, WSTETH_OPTIMISM_SEP2024],
    MARKETS_BY_NAME: {
        RETH_OPTIMISM_JUNE2024,
        WSTETH_OPTIMISM_SEP2024,
    },
    FUND_KEEPER: DUMMY_ADDRESS,
    FAUCET: DUMMY_ADDRESS,
    TOKENS: {
        USDC: '0x7f5c764cbc14f9669b88837ca1490cca17c31607',
        USDT: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
        DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
        WETH: '0x4200000000000000000000000000000000000006',
    },
} as const);
