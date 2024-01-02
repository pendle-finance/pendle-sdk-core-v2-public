import { LimitOrderMatchedResult } from './LimitOrderMatchedResult';
import { Address, RawTokenAmount, BN } from '../../../common';
import { MarketEntity } from '../../MarketEntity';
import * as contractTypes from '@pendle/core-v2/typechain-types/IPAllActionV3';

type LimitOrderDataStruct = contractTypes.LimitOrderDataStruct;
type RouterMethodNames = keyof contractTypes.IPAllActionV3['callStatic'];
type IsSupportedLimitOrderMethod<M extends RouterMethodNames> = M extends string
    ? LimitOrderDataStruct extends Parameters<contractTypes.IPAllActionV3['callStatic'][M]>[number]
        ? M
        : never
    : never;
export type SupportedLimitOrderRouterMethods = IsSupportedLimitOrderMethod<RouterMethodNames>;

export interface LimitOrderMatcher {
    swapPtForSy(
        market: Address | MarketEntity,
        netPtIn: BN,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;
    swapYtForSy(
        market: Address | MarketEntity,
        netYtIn: BN,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;

    swapSyForPt(
        market: Address | MarketEntity,
        netSyIn: BN,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;
    swapSyForYt(
        market: Address | MarketEntity,
        netSyIn: BN,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;

    swapTokenForPt(
        market: Address | MarketEntity,
        netTokenIn: RawTokenAmount<BN>,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;
    swapTokenForYt(
        market: Address | MarketEntity,
        netTokenIn: RawTokenAmount<BN>,
        params: { routerMethod: SupportedLimitOrderRouterMethods }
    ): Promise<LimitOrderMatchedResult>;
}

export class VoidLimitOrderMatcher implements LimitOrderMatcher {
    static readonly INSTANCE = new VoidLimitOrderMatcher();
    static readonly RESULT = Promise.resolve(LimitOrderMatchedResult.EMPTY);

    static create(): VoidLimitOrderMatcher {
        return new VoidLimitOrderMatcher();
    }

    swapSyForPt(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }
    swapSyForYt(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }

    swapPtForSy(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }
    swapYtForSy(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }

    swapTokenForPt(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }
    swapTokenForYt(): Promise<LimitOrderMatchedResult> {
        return VoidLimitOrderMatcher.RESULT;
    }
}
