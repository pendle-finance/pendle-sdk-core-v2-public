import { NATIVE_ADDRESS_0xEE } from '../../src';
import { ethers } from 'ethers';

export const INF = ethers.constants.MaxUint256;

export const DUMMY_ADDRESS = NATIVE_ADDRESS_0xEE;

export const ONE_E18_BN = ethers.BigNumber.from(10).pow(18);

export const DEFAULT_EPSILON = 0.01;
// because we couldn't fork the aggregator result, we need to set a bigger epsilon for tx that
// involve aggregator
export const EPSILON_FOR_AGGREGATOR = 0.1;

// ============
export const DEFAULT_SWAP_AMOUNT = 1;

export const MAX_PT_SWAP_AMOUNT = 10;

export const MAX_YT_SWAP_AMOUNT = 20;

export const MAX_SY_SWAP_AMOUNT = 10;

// ============

export const MAX_TOKEN_ADD_AMOUNT = 20;

export const MAX_PT_ADD_AMOUNT = 8;

export const MAX_YT_ADD_AMOUNT = 40;

export const MAX_SY_ADD_AMOUNT = 10;

// ============

export const MAX_REMOVE_LIQUIDITY_AMOUNT = 20;

// ============
export const SLIPPAGE_TYPE1 = 0.1;

export const SLIPPAGE_TYPE2 = 0.2;

export const SLIPPAGE_TYPE3 = 1;

export const DEFAULT_MINT_AMOUNT = 100;
