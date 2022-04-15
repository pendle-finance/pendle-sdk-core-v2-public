import { BigNumber as BN } from "ethers";

export const PERCENTAGE_DECIMALS = 6;

export function decimalFactor(decimals: number): string {
    return BN.from(10).pow(decimals).toString();
}

export function calcSlippedDownAmount(theoriticalAmount: BN, slippage: number): BN {
    return theoriticalAmount.mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).sub(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS)))).div(decimalFactor(PERCENTAGE_DECIMALS));
}

export function calcSlippedUpAmount(theoriticalAmount: BN, slippage: number): BN {
    return theoriticalAmount.mul(BN.from(decimalFactor(PERCENTAGE_DECIMALS)).add(Math.trunc(slippage * Math.pow(10, PERCENTAGE_DECIMALS)))).div(decimalFactor(PERCENTAGE_DECIMALS));
}
