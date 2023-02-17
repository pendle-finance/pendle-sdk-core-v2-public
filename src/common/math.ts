/**
 * In this package, when we mention ONE, we mean 10^18. That is:
 *
 *      const ONE = BN.from(10).pow(18);
 */
import { BN, BigNumberish, ethersConstants } from './ethersjs';
export const PERCENTAGE_DECIMALS = 6;
export const PERCENTAGE_NUMBER_FACTOR = 10 ** PERCENTAGE_DECIMALS;

export function decimalFactor(decimals: number): BN {
    return BN.from(10).pow(decimals);
}

const ONE = decimalFactor(18);

export function mulSmallNum(bn: BN, num: number): BN {
    return bnSafeClamp(bn.mul(Math.floor(num * PERCENTAGE_NUMBER_FACTOR)).div(PERCENTAGE_NUMBER_FACTOR));
}

export function calcSlippedDownAmount(theoreticalAmount: BN, slippage: number): BN {
    return mulSmallNum(theoreticalAmount, 1 - slippage);
}

export function calcSlippedDownAmountSqrt(theoreticalAmount: BN, slippage: number): BN {
    return mulSmallNum(theoreticalAmount, Math.sqrt(1 - slippage));
}

export function calcSlippedUpAmount(theoreticalAmount: BN, slippage: number): BN {
    return mulSmallNum(theoreticalAmount, 1 + slippage);
}

export function bnMax(a: BigNumberish, b: BigNumberish): BN {
    a = BN.from(a);
    b = BN.from(b);
    return a.gt(b) ? a : b;
}

export function bnMin(a: BigNumberish, b: BigNumberish): BN {
    a = BN.from(a);
    b = BN.from(b);
    return a.lt(b) ? a : b;
}

export function bnSafeDiv(a: BigNumberish, b: BigNumberish, fallback: BigNumberish = ethersConstants.Zero): BN {
    a = BN.from(a);
    b = BN.from(b);
    return b.isZero() ? BN.from(fallback) : a.div(b);
}

/**
 * Precondition: lower <= upper.
 */
export function bnClamp(num: BigNumberish, lower: BigNumberish, upper: BigNumberish): BN {
    num = BN.from(num);
    return num.lt(lower) ? BN.from(lower) : num.gt(upper) ? BN.from(upper) : num;
}

export function bnSafeClamp(num: BigNumberish) {
    return bnClamp(num, ethersConstants.Zero, ethersConstants.MaxUint256);
}

/**
 * Based on the following two contracts
 * - https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/core/StandardizedYield/SYUtils.sol
 * - https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/core/StandardizedYield/PYIndex.sol
 */
export class PyIndex {
    readonly index: BN;

    /**
     * @param index the pyIndex. Normally it is the result of YtEntity#pyIndexCurrent()
     */
    constructor(index: BigNumberish) {
        this.index = BN.from(index);
    }

    /**
     * @remarks
     * Precondition: `syAmount >= 0`
     * If not sure, use {@link PyIndex#syToAsset}
     */
    syToAssetUnsigned(syAmount: BigNumberish): BN {
        return this.index.mul(syAmount).div(ONE);
    }

    syToAsset(syAmount: BigNumberish): BN {
        syAmount = BN.from(syAmount);
        const sign = syAmount.isNegative() ? -1 : 1;
        return this.syToAssetUnsigned(syAmount.abs()).mul(sign);
    }

    /**
     * @remarks
     * Precondition: `syAmount >= 0`
     * If not sure, use {@link PyIndex#syToAssetUp}
     */
    syToAssetUpUnsigned(syAmount: BigNumberish): BN {
        return this.index.mul(syAmount).add(ONE).sub(1).div(ONE);
    }

    syToAssetUp(syAmount: BigNumberish): BN {
        syAmount = BN.from(syAmount);
        const sign = syAmount.isNegative() ? -1 : 1;
        return this.syToAssetUpUnsigned(syAmount.abs()).mul(sign);
    }

    /**
     * @remarks
     * Precondition: `syAmount >= 0`
     * If not sure, use {@link PyIndex#assetToSy}
     */
    assetToSyUnsigned(assetAmount: BigNumberish): BN {
        return ONE.mul(assetAmount).div(this.index);
    }

    assetToSy(assetAmount: BigNumberish): BN {
        assetAmount = BN.from(assetAmount);
        const sign = assetAmount.isNegative() ? -1 : 1;
        return this.assetToSyUnsigned(assetAmount).mul(sign);
    }

    /**
     * @remarks
     * Precondition: `syAmount >= 0`
     * If not sure, use {@link PyIndex#assetToSyUp}
     */
    assetToSyUpUnsigned(assetAmount: BigNumberish): BN {
        return ONE.mul(assetAmount).add(this.index).sub(1).div(this.index);
    }

    assetToSyUp(assetAmount: BigNumberish): BN {
        assetAmount = BN.from(assetAmount);
        const sign = assetAmount.isNegative() ? -1 : 1;
        return this.assetToSyUpUnsigned(assetAmount).mul(sign);
    }
}

/**
 * This class is for convenient conversion between pt <-> asset and yt <-> asset,
 * with a given market's exchange rate.
 *
 * Market's exchange rate can be obtained from
 * MarketEntity#getMarketInfo().exchangeRate, divided by ONE (10^18)
 *
 * The exchange rate ($x$) is the rate of converting the underlying asset into
 * pt, that is
 *
 *      1 asset = x PT                      (1.1)
 *      1 PT = 1/x asset                    (1.2)
 *
 * From here we can have the formula for converting asset <-> PT
 *
 * For converting asset <-> YT, we need the following formula from the yield
 * tokenization model
 *
 *      1 asset = 1 PT + 1 YT               (2)
 *
 * From (1.2) and (2), we have:
 *
 *      1 asset = 1/x asset + 1 YT
 *  <=> 1 asset = x / (x - 1) YT            (3.1)
 *  and 1 YT = (1 - 1 / x) asset            (3.2)
 */
// TODO separate unsigned and signed functions
// TODO round up functions?
export class MarketExchangeRate {
    /**
     * Note that, in the above formula, x = this.exchangeRate / ONE
     */
    readonly exchangeRate: BN;

    constructor(exchangeRate: BigNumberish) {
        this.exchangeRate = BN.from(exchangeRate);
    }

    /**
     * See formula (1.1)
     * 1 asset = x PT
     *
     * So if we have k = assetAmount:
     * k asset = x * k PT
     */
    assetToPt(assetAmount: BigNumberish): BN {
        return this.exchangeRate.mul(assetAmount).div(ONE);
    }

    /**
     * See formula (1.2)
     * 1 PT = 1/x asset
     *
     * So if we have k = ptAmount:
     * k PT = k/x asset
     */
    ptToAsset(ptAmount: BigNumberish): BN {
        return ONE.mul(ptAmount).div(this.exchangeRate);
    }

    /**
     * See formula (3.1)
     *
     * 1 asset = x / (x - 1) / YT
     *         = (this.exchangeRate / ONE) / (this.exchangeRate / ONE - 1) YT
     *         = this.exchangeRate / (this.exchangeRate - ONE) YT
     *
     * So if we have k = assetAmount
     * k asset = k * this.exchangeRate / (this.exchangeRate - ONE) YT
     */
    assetToYt(assetAmount: BigNumberish): BN {
        return this.exchangeRate.mul(assetAmount).div(this.exchangeRate.sub(ONE));
    }

    /**
     * See formula (3.2)
     * 1 YT = (1 - 1/x) asset = (x - 1) / x asset
     *      = (this.exchangeRate / ONE - 1) / (this.exchangeRate / ONE) asset
     *      = (this.exchangeRate - ONE) / this.exchangeRate asset
     *
     * So if we have k = ytAmount
     * k YT = k * (this.exchangeRate - ONE) / this.exchangeRate asset
     */
    ytToAsset(ytAmount: BigNumberish): BN {
        return this.exchangeRate.sub(ONE).mul(ytAmount).div(this.exchangeRate);
    }
}
