import { ethers } from 'ethers';

export const INF = ethers.constants.MaxUint256;

export const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001';

export const ONE_E18_BN = ethers.BigNumber.from(10).pow(18);

export const DEFAULT_EPSILON = 0.01;

// ============
export const DEFAULT_SWAP_AMOUNT = 100;

export const MAX_PT_SWAP_AMOUNT = 100;

export const MAX_YT_SWAP_AMOUNT = 200;

export const MAX_SY_SWAP_AMOUNT = 100;

// ============

export const MAX_TOKEN_ADD_AMOUNT = 200;

export const MAX_PT_ADD_AMOUNT = 100;

export const MAX_YT_ADD_AMOUNT = 400;

export const MAX_SY_ADD_AMOUNT = 100;

// ============

export const MARKET_SWAP_FACTOR = 50; // swap amount at most (market balance / 50)

export const REDEEM_FACTOR = 10; // Redeem 1/10 of SY balance

export const REMOVE_LIQUIDITY_FACTOR = 40; // Remove 1/40 of LP balance from liquidity pool

export const REMOVE_LIQUIDITY_FACTOR_ZAP = 40_000; // Bigger than REMOVE_LIQUIDITY_FACTOR because zap involves swapping

// ============
export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.5;

export const SLIPPAGE_TYPE3 = 1;

export const DEFAULT_MINT_AMOUNT = 100;
