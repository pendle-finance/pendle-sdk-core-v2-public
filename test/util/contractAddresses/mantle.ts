import MANTLE_CORE_ADDRESSES from '@pendle/core-v2/deployments/5000-core.json';
import WSTETH_MANTLE_MARCH2024 from '@pendle/core-v2/deployments/5000-markets/WSTETH-MANTLE-MARCH2024.json';

import { DUMMY_ADDRESS } from '../constants';
import { shallowToAddress } from './helper';

export const MANTLE_CONTRACT_ADDRESSES = shallowToAddress({
    CORE: {
        DEPLOYER: MANTLE_CORE_ADDRESSES.deployer,
        MARKET_FACTORY: MANTLE_CORE_ADDRESSES.marketFactory,
        YT_FACTORY: MANTLE_CORE_ADDRESSES.yieldContractFactory,
        ROUTER: MANTLE_CORE_ADDRESSES.router,
        ROUTER_STATIC: MANTLE_CORE_ADDRESSES.routerStatic,
        VE: MANTLE_CORE_ADDRESSES.vePendle,
        VOTING_CONTROLLER: DUMMY_ADDRESS,
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: MANTLE_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [WSTETH_MANTLE_MARCH2024],
    MARKETS_BY_NAME: {
        WSTETH_MANTLE_MARCH2024,
    },
    FUND_KEEPER: DUMMY_ADDRESS,
    FAUCET: DUMMY_ADDRESS,
    TOKENS: {
        USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
        USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE',
        DAI: '0xAfAF32C57659BC9992b43bc6840A9d997632a0F5',
        WETH: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
    },
});
