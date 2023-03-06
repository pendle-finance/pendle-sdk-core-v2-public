import { ethers } from 'ethers';

export const INF = ethers.constants.MaxUint256;

export const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001';

export const ONE_E18_BN = ethers.BigNumber.from(10).pow(18);

export const DEFAULT_EPSILON = 0.01;
// because we couldn't fork the aggregator result, we need to set a bigger epsilon for tx that
// involve aggregator
export const EPSILON_FOR_AGGREGATOR = 0.3;

// ============
export const DEFAULT_SWAP_AMOUNT = 1;

export const MAX_PT_SWAP_AMOUNT = 10;

export const MAX_YT_SWAP_AMOUNT = 20;

export const MAX_SY_SWAP_AMOUNT = 10;

// ============

export const MAX_TOKEN_ADD_AMOUNT = 20;

export const MAX_PT_ADD_AMOUNT = 10;

export const MAX_YT_ADD_AMOUNT = 40;

export const MAX_SY_ADD_AMOUNT = 10;

// ============

export const MAX_REMOVE_LIQUIDITY_AMOUNT = 20;

export const MARKET_SWAP_FACTOR = 50; // swap amount at most (market balance / 50)

export const REDEEM_FACTOR = 10; // Redeem 1/10 of SY balance

// ============
export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.2;

export const SLIPPAGE_TYPE3 = 1;

export const DEFAULT_MINT_AMOUNT = 100;

// this map will be added over time
export const BALANCE_OF_STORAGE_SLOT: Record<string, [number, boolean]> = {
    '0x3175df0976dfa876431c2e9ee6bc45b65d3473cc': [7, true], // Curve.fi FRAX/USDC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': [9, false], // USDC
    '0x5ea8c8e02c2d413165c1adcbb6916b0851f6cd73': [9, false], // USDC on mumbai
    '0xc2a6b8d7d0fab3749a6bda84cedb58d2d58f045e': [9, false], // USDC on fuji
    '0x76818c92936662e9b24f74395f38634c35604720': [14, false], // qiUSDC on mumbai
    '0xee3a174f1478198fbc669132b1e2cc13b5686f94': [14, false], // qiUSDC on fuji
    '0xdac17f958d2ee523a2206206994597c13d831ec7': [2, false], // USDT
    '0xafc1ac698e9b54c240e6ebc7d64200bb84f2e4cd': [0, false], // USDT on mumbai
    '0x9be875cdbb8409dbc1a553c8ddc1fc05cddf80ce': [0, false], // USDT on fuji
    '0x39117590fcdc8c278dead738a33c3acaac27a3eb': [0, false], // APE on fuji
    '0x6b175474e89094c44da98b954eedeac495271d0f': [2, false], // DAI
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': [3, false], // WETH
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': [3, false], // WETH
    '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': [0, false], // wstETH
    '0x853d955acef822db058eb8505911ed77f175b99e': [0, false], // FRAX
};
