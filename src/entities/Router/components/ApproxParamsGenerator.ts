import { BaseRouter } from '../BaseRouter';
import * as contractTypes from '@pendle/core-v2/typechain-types/IPAllActionV3';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as common from '../../../common';
import { FixedX18 } from '@pendle/core-v2-offchain-math';
import { BN } from '../../../common';
import { Promisable } from 'type-fest';
import { LimitOrderMatchedResult } from '../limitOrder';

type ApproxParamsStruct = contractTypes.ApproxParamsStruct;
type RouterMethodNames = keyof contractTypes.IPAllActionV3['callStatic'];
export type RouterMethodsWithApproximation = {
    [M in RouterMethodNames]: ApproxParamsStruct extends Parameters<
        contractTypes.IPAllActionV3['callStatic'][M]
    >[number]
        ? M
        : never;
}[RouterMethodNames];

export type ApproxSearchingRange = offchainMath.ApproxSearchingRange;

export type ApproxParamsGeneratorContext = {
    routerMethod: RouterMethodsWithApproximation;
    guessOffchain: common.BigNumberish;
    approxSearchingRange: ApproxSearchingRange;
    slippage: number;
    limitOrderMatchedResult: LimitOrderMatchedResult | undefined;
};

export interface ApproxParamsGenerator {
    generate(router: BaseRouter, context: ApproxParamsGeneratorContext): Promisable<ApproxParamsStruct>;
}

export class DefaultApproxParamsGenerator implements ApproxParamsGenerator {
    static readonly instance = new DefaultApproxParamsGenerator();

    generate(router: BaseRouter, context: ApproxParamsGeneratorContext): ApproxParamsStruct {
        const guessOffchain = BN.from(context.guessOffchain);

        let guessMin = BN.from(context.approxSearchingRange.guessMin);
        let guessMax = BN.from(context.approxSearchingRange.guessMax);

        let MAGIC_PADDING = 3;

        if (router.chainId !== common.CHAIN_ID_MAPPING.ARBITRUM) {
            guessMin = common.bnMax(guessMin, common.calcSlippedDownAmount(guessOffchain, 3 * context.slippage));
            guessMax = common.bnMin(guessMax, common.calcSlippedUpAmount(guessOffchain, 3 * context.slippage));
        } else {
            MAGIC_PADDING = 10;
        }

        const eps = FixedX18.fromRawValue(10n ** 14n);
        const rangeDiff = FixedX18.fromBigint(guessMax.sub(guessMin).toBigInt());

        const maxIteration = flooredLn2(rangeDiff) + MAGIC_PADDING;

        return {
            guessMin,
            guessMax,
            eps: eps.value,
            guessOffchain,
            maxIteration,
        };
    }
}

export class LegacyApproxParamsGenerator implements ApproxParamsGenerator {
    static readonly instance = new LegacyApproxParamsGenerator();

    generate(_router: BaseRouter, context: ApproxParamsGeneratorContext): ApproxParamsStruct {
        switch (context.routerMethod) {
            case 'addLiquiditySingleSy':
            case 'addLiquiditySingleToken':
            case 'removeLiquiditySinglePt':
            case 'swapExactTokenForPt':
            case 'swapExactSyForPt':
            case 'swapExactSyForYt':
            case 'swapExactTokenForYt':
            case 'swapExactYtForPt':
                return this.getApproxParamsToPullPt(BN.from(context.guessOffchain), context.slippage);

            case 'addLiquiditySinglePt':
            case 'swapExactPtForYt':
                return this.getApproxParamsToPushPt(BN.from(context.guessOffchain), context.slippage);
        }
    }

    static readonly EPS: number = 1e-4;

    static readonly STATIC_APPROX_PARAMS = {
        eps: offchainMath.FixedX18.fromNumber(LegacyApproxParamsGenerator.EPS).value,
        maxIteration: 256,
        guessMin: 0,
        guessMax: 2n ** 256n - 1n,
        guessOffchain: 0n,
    } satisfies ApproxParamsStruct;

    getApproxParamsToPullPt(guessAmountOut: BN | bigint, slippage: number): ApproxParamsStruct {
        return {
            ...LegacyApproxParamsGenerator.STATIC_APPROX_PARAMS,
            guessMin: common.calcSlippedDownAmount(guessAmountOut, 1 * slippage),
            guessMax: common.calcSlippedUpAmount(guessAmountOut, 5 * slippage),
            guessOffchain: guessAmountOut,
            maxIteration: this.calcMaxIteration(slippage),
        };
    }

    getApproxParamsToPushPt(guessAmountIn: BN | bigint, slippage: number): ApproxParamsStruct {
        return {
            ...LegacyApproxParamsGenerator.STATIC_APPROX_PARAMS,
            guessMin: common.calcSlippedDownAmount(guessAmountIn, 5 * slippage),
            guessMax: common.calcSlippedUpAmount(guessAmountIn, 1 * slippage),
            guessOffchain: guessAmountIn,
            maxIteration: this.calcMaxIteration(slippage),
        };
    }

    protected calcMaxIteration(slippage: number): number {
        const x = (6 * slippage) / LegacyApproxParamsGenerator.EPS;
        if (x <= 1) return 3;
        return Math.ceil(Math.log2(x)) + 3;
    }
}

export class MixedApproxParamsGenerator implements ApproxParamsGenerator {
    static instance = new MixedApproxParamsGenerator();

    generate(router: BaseRouter, context: ApproxParamsGeneratorContext): ApproxParamsStruct {
        if (router.chainId === common.CHAIN_ID_MAPPING.ARBITRUM) {
            return DefaultApproxParamsGenerator.instance.generate(router, context);
        } else {
            return LegacyApproxParamsGenerator.instance.generate(router, context);
        }
    }
}

// export const defaultApproxParamsGenerator = DefaultApproxParamsGenerator.instance;

// Current Pendle is using this approx params generator
// Will change to the {@link DefaultApproxParamsGenerator} when it is actually used.
export const defaultApproxParamsGenerator = MixedApproxParamsGenerator.instance;

const LN2 = FixedX18.fromNumber(2).ln();
function ln2(x: FixedX18): FixedX18 {
    return x.ln().divDown(LN2);
}

function flooredLn2(x: FixedX18): number {
    return Math.floor(ln2(x).toNumber());
}
