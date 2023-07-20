import MAINNET_CORE_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-core.json';
import MAINNET_FRAX_MAR23_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/FRAXUSDC-CURVELP-MARCH30.json';
import MAINNET_LOOKS_MAR23_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/LOOKS-STAKING-MARCH30.json';
import MAINNET_STETH_MAR30_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/STETH-MARCH30.json';
import MAINNET_RETH_DEC28_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/BALANCER-LP-AURA-RETH-WETH-28DEC.json';
import MAINNET_STETH_JUN29_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/STETH-JUNE29.json';
import MAINNET_APE_JUN29_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/APE-JUNE-29.json';
import MAINNET_WSTETH_JUN272024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/BALANCER-LP-AURA-WSTETH-WETH-JUN272024.json';
import MAINNET_ANKRETH_MAR28_2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/deprecated/BALANCER-LP-AURA-ANKRETH-WETH-MARCH-28-2024.json';
import MAINNET_SFRXETH_26DEC2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/STETH-26DEC2024.json';
import MAINNET_STARGATE_27JUNE2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/STARGATE-USDT-27JUNE2024-ETHEREUM.json';
import MAINNET_STAFI_27JUNE2024_ADDRESSES from '@pendle/core-v2-mainnet/deployments/1-markets/BALANCER-LP-AURA-STAFI-RETH-WETH-JUNE-27-2024.json';

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
        FEE_DISTRIBUTOR: DUMMY_ADDRESS,
        PENDLE: MAINNET_CORE_ADDRESSES.PENDLE,
    },
    MARKETS: [
        MAINNET_FRAX_MAR23_ADDRESSES,
        MAINNET_LOOKS_MAR23_ADDRESSES,
        MAINNET_STETH_MAR30_ADDRESSES,
        MAINNET_STETH_JUN29_ADDRESSES,
        MAINNET_APE_JUN29_ADDRESSES,
        MAINNET_RETH_DEC28_ADDRESSES,
        MAINNET_WSTETH_JUN272024_ADDRESSES,
        MAINNET_ANKRETH_MAR28_2024_ADDRESSES,
        MAINNET_SFRXETH_26DEC2024_ADDRESSES,
        MAINNET_STARGATE_27JUNE2024_ADDRESSES,
        MAINNET_STAFI_27JUNE2024_ADDRESSES,
    ],
    MARKETS_BY_NAME: {
        MAINNET_FRAX_MAR23_ADDRESSES,
        MAINNET_LOOKS_MAR23_ADDRESSES,
        MAINNET_STETH_MAR30_ADDRESSES,
        MAINNET_STETH_JUN29_ADDRESSES,
        MAINNET_APE_JUN29_ADDRESSES,
        MAINNET_RETH_DEC28_ADDRESSES,
        MAINNET_WSTETH_JUN272024_ADDRESSES,
        MAINNET_ANKRETH_MAR28_2024_ADDRESSES,
        MAINNET_SFRXETH_26DEC2024_ADDRESSES,
        MAINNET_STARGATE_27JUNE2024_ADDRESSES,
        MAINNET_STAFI_27JUNE2024_ADDRESSES,
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
