import * as route from './route';

export type ComponentsForTokenMintSySelectionRouting =
    | 'approvedSignerAddressGetter'
    | 'aggregatorResultGetter'
    | 'syIOTokenAmountGetter'
    | 'gasUsedEstimator'
    | 'intermediateSyAmountGetter'
    | 'netOutGetter'
    | 'netOutInNativeEstimator';

export type ComponentsForTokenRedeemSySelectionRouting =
    | 'approvedSignerAddressGetter'
    | 'aggregatorResultGetter'
    | 'syIOTokenAmountGetter'
    | 'gasUsedEstimator'
    | 'intermediateSyAmountGetter'
    | 'netOutGetter'
    | 'netOutInNativeEstimator';

export type ComponentsForLimitOrderRouting = 'limitOrderMatcher' | 'netOutGetter';

type R<RC extends route.Route.ComponentName> = route.Route.PartialRoute<'contractMethodBuilder' | RC>;

export type AddLiquidityDualTokenAndPt = R<ComponentsForTokenMintSySelectionRouting>;
export type AddLiquiditySinglePt = R<ComponentsForLimitOrderRouting>;
export type AddLiquiditySingleSy = R<ComponentsForLimitOrderRouting>;
export type AddLiquiditySingleTokenKeepYt = R<ComponentsForTokenMintSySelectionRouting>;
export type AddLiquiditySingleToken = R<ComponentsForTokenMintSySelectionRouting | ComponentsForLimitOrderRouting>;

export type RemoveLiquidityDualTokenAndPt = R<ComponentsForTokenRedeemSySelectionRouting>;
export type RemoveLiquiditySinglePt = R<ComponentsForLimitOrderRouting>;
export type RemoveLiquiditySingleSy = R<ComponentsForLimitOrderRouting>;
export type RemoveLiquiditySingleToken = R<ComponentsForTokenRedeemSySelectionRouting | ComponentsForLimitOrderRouting>;

export type SwapExactTokenForPt = R<ComponentsForTokenMintSySelectionRouting | ComponentsForLimitOrderRouting>;
export type SwapExactTokenForYt = R<ComponentsForTokenMintSySelectionRouting | ComponentsForLimitOrderRouting>;
export type SwapExactSyForPt = R<ComponentsForLimitOrderRouting>;
export type SwapExactSyForYt = R<ComponentsForLimitOrderRouting>;
export type SwapExactPtForToken = R<ComponentsForTokenRedeemSySelectionRouting | ComponentsForLimitOrderRouting>;
export type SwapExactYtForToken = R<ComponentsForTokenRedeemSySelectionRouting | ComponentsForLimitOrderRouting>;

export type SwapExactPtForSy = R<ComponentsForLimitOrderRouting>;
export type SwapExactYtForSy = R<ComponentsForLimitOrderRouting>;

export type SwapTokenToTokenViaSy = R<ComponentsForTokenMintSySelectionRouting>;

export type MintSyFromToken = R<ComponentsForTokenMintSySelectionRouting>;
export type MintPyFromToken = R<ComponentsForTokenMintSySelectionRouting>;
export type RedeemSyToToken = R<ComponentsForTokenRedeemSySelectionRouting>;
export type RedeemPyToToken = R<ComponentsForTokenRedeemSySelectionRouting>;
