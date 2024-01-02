import * as pendleSDK from '../../src';
import { BalanceSnapshot } from './setup';

const MARKET_SWAP_FACTOR = 1 / 50;
export const getMarketAmountForSySwap = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.mulSmallNum(balanceSnapshot.marketSyBalance, MARKET_SWAP_FACTOR);

export const getSySwapAmountOut = (balanceSnapshot: BalanceSnapshot) => getMarketAmountForSySwap(balanceSnapshot);
export const getSySwapAmountIn = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.bnMin(getMarketAmountForSySwap(balanceSnapshot), balanceSnapshot.syBalance);

export const getMarketAmountForPtSwap = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.mulSmallNum(balanceSnapshot.marketSyBalance, MARKET_SWAP_FACTOR);

export const getPtSwapAmountOut = (balanceSnapshot: BalanceSnapshot) => getMarketAmountForPtSwap(balanceSnapshot);
export const getPtSwapAmountIn = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.bnMin(getMarketAmountForPtSwap(balanceSnapshot), balanceSnapshot.ptBalance);

export const getMarketAmountForYtSwap = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.mulSmallNum(balanceSnapshot.marketPtBalance, MARKET_SWAP_FACTOR); // `pt` is not a typo here

export const getYtSwapAmountOut = (balanceSnapshot: BalanceSnapshot) => getMarketAmountForYtSwap(balanceSnapshot);
export const getYtSwapAmountIn = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.bnMin(getMarketAmountForYtSwap(balanceSnapshot), balanceSnapshot.ytBalance);

const REDEEM_FACTOR = 1 / 10;
export const getPyRedeemAmount = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.mulSmallNum(pendleSDK.bnMin(balanceSnapshot.ptBalance, balanceSnapshot.ytBalance), REDEEM_FACTOR);

export const getSyRedeemAmount = (balanceSnapshot: BalanceSnapshot) =>
    pendleSDK.mulSmallNum(balanceSnapshot.syBalance, REDEEM_FACTOR);
