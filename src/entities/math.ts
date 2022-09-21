/**
 * In this package, when we mention ONE, we mean 10^18. That is:
 *
 *      const ONE = BN.from(10).pow(18);
 */
import { BigNumber as BN, constants as ethersConstants } from 'ethers';
import type { BigNumberish } from 'ethers';
import { PERCENTAGE_DECIMALS } from '../constants';

export function decimalFactor(decimals: number): BN {
    return BN.from(10).pow(decimals);
}

const ONE = decimalFactor(18);

export function calcSlippedDownAmount(theoreticalAmount: BN, slippage: number): BN {
    return bnSafeClamp(
        theoreticalAmount
            .mul(decimalFactor(PERCENTAGE_DECIMALS).sub(Math.trunc(slippage * 10 ** PERCENTAGE_DECIMALS)))
            .div(decimalFactor(PERCENTAGE_DECIMALS))
    );
}

export function calcSlippedUpAmount(theoreticalAmount: BN, slippage: number): BN {
    return bnSafeClamp(
        theoreticalAmount
            .mul(decimalFactor(PERCENTAGE_DECIMALS).add(Math.trunc(slippage * 10 ** PERCENTAGE_DECIMALS)))
            .div(decimalFactor(PERCENTAGE_DECIMALS))
    );
}

export function bnMax(a: BigNumberish, b: BigNumberish): BigNumberish {
    return BN.from(a).gt(b) ? a : b;
}

export function bnMin(a: BigNumberish, b: BigNumberish): BigNumberish {
    return BN.from(a).lt(b) ? a : b;
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
 * https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/libraries/SCY/SCYUtils.sol
 * https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/libraries/helpers/PYIndex.sol
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
     * Precondition: scyAmount >= 0
     * If not sure, use PyIndex#scyToAsset
     */
    scyToAssetUnsigned(scyAmount: BigNumberish): BN {
        return this.index.mul(scyAmount).div(ONE);
    }

    scyToAsset(scyAmount: BigNumberish): BN {
        scyAmount = BN.from(scyAmount);
        const sign = scyAmount.isNegative() ? -1 : 1;
        return this.scyToAssetUnsigned(scyAmount.abs()).mul(sign);
    }

    /**
     * Precondition: scyAmount >= 0
     * If not sure, use PyIndex#scyToAssetUp
     */
    scyToAssetUpUnsigned(scyAmount: BigNumberish): BN {
        return this.index.mul(scyAmount).add(ONE).sub(1).div(ONE);
    }

    scyToAssetUp(scyAmount: BigNumberish): BN {
        scyAmount = BN.from(scyAmount);
        const sign = scyAmount.isNegative() ? -1 : 1;
        return this.scyToAssetUpUnsigned(scyAmount.abs()).mul(sign);
    }

    /**
     * Precondition: scyAmount >= 0
     * If not sure, use PyIndex#assetToScy
     */
    assetToScyUnsigned(assetAmount: BigNumberish): BN {
        return ONE.mul(assetAmount).div(this.index);
    }

    assetToScy(assetAmount: BigNumberish): BN {
        assetAmount = BN.from(assetAmount);
        const sign = assetAmount.isNegative() ? -1 : 1;
        return this.assetToScyUnsigned(assetAmount).mul(sign);
    }

    /**
     * Precondition: scyAmount >= 0
     * If not sure, use PyIndex#assetToScyUp
     */
    assetToScyUpUnsigned(assetAmount: BigNumberish): BN {
        return ONE.mul(assetAmount).add(this.index).sub(1).div(this.index);
    }

    assetToScyUp(assetAmount: BigNumberish): BN {
        assetAmount = BN.from(assetAmount);
        const sign = assetAmount.isNegative() ? -1 : 1;
        return this.assetToScyUpUnsigned(assetAmount).mul(sign);
    }
}

/**
 * This class is for convenient conversion between pt <-> asset and yt <-> asset,
 * with a given market's exchange rate.
 *
 * Market's exchange rate can be obtained from
 * MarketEntity#getMarketInfo().exchangeRate, divided by ONE (10^18)
 *
 * The exchange rate (x) is the rate of converting the underlying asset into
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
     */
    ptToAsset(ptAmount: BigNumberish): BN {
        return this.exchangeRate.mul(ptAmount).div(ONE);
    }

    /**
     * See formula (1.2)
     */
    assetToPt(assetAmount: BigNumberish): BN {
        return ONE.mul(assetAmount).div(this.exchangeRate);
    }

    /**
     * See formula (3.1)
     *
     * 1 asset = x / (x - 1) / YT
     *         = (this.exchangeRate / ONE) / (this.exchangeRate / ONE - 1) YT
     *         = this.exchangeRate / (this.exchangeRate - ONE) YT
     */
    ytToAsset(ytAmount: BigNumberish): BN {
        return this.exchangeRate.mul(ytAmount).div(this.exchangeRate.sub(ONE));
    }

    /**
     * See formula (3.2)
     * 1 YT = (1 - 1/x) asset = (x - 1) / x asset
     *      = (this.exchangeRate / ONE - 1) / (this.exchangeRate / ONE) asset
     *      = (this.exchangeRate - ONE) / this.exchangeRate asset
     */
    assetToYt(assetAmount: BigNumberish): BN {
        return this.exchangeRate.sub(ONE).mul(assetAmount).div(this.exchangeRate);
    }
}
