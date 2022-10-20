import { PendleContractErrorMessageHandler } from './type';

function joinArgs(args: any[]) {
    return args.map((arg) => String(arg)).join(', ');
}

// TODO write more descriptive error messages.
export const defaultPendleContractErrorMessageHandler: PendleContractErrorMessageHandler = {
    ApproxFail: (...args) => `Got ApproxFail error (${joinArgs(args)})`,
    ApproxParamsInvalid: (...args) => `Got ApproxParamsInvalid error (${joinArgs(args)})`,
    ArrayEmpty: (...args) => `Got ArrayEmpty error (${joinArgs(args)})`,
    ArrayLengthMismatch: (...args) => `Got ArrayLengthMismatch error (${joinArgs(args)})`,
    ArrayOutOfBounds: (...args) => `Got ArrayOutOfBounds error (${joinArgs(args)})`,
    ChainNotSupported: (...args) => `Got ChainNotSupported error (${joinArgs(args)})`,
    ExpiryInThePast: (...args) => `Got ExpiryInThePast error (${joinArgs(args)})`,
    FDCantFundFutureEpoch: (...args) => `Got FDCantFundFutureEpoch error (${joinArgs(args)})`,
    FDFactoryDistributorAlreadyExisted: (...args) => `Got FDFactoryDistributorAlreadyExisted error (${joinArgs(args)})`,
    GCNotPendleMarket: (...args) => `Got GCNotPendleMarket error (${joinArgs(args)})`,
    GCNotVotingController: (...args) => `Got GCNotVotingController error (${joinArgs(args)})`,
    InsufficientFeeToSendMsg: (...args) => `Got InsufficientFeeToSendMsg error (${joinArgs(args)})`,
    InvalidWTime: (...args) => `Got InvalidWTime error (${joinArgs(args)})`,
    MFactoryLnFeeRateRootTooHigh: (...args) => `Got MFactoryLnFeeRateRootTooHigh error (${joinArgs(args)})`,
    MFactoryReserveFeePercentTooHigh: (...args) => `Got MFactoryReserveFeePercentTooHigh error (${joinArgs(args)})`,
    MarketExchangeRateBelowOne: (...args) => `Got MarketExchangeRateBelowOne error (${joinArgs(args)})`,
    MarketExpired: (...args) => `Got MarketExpired error (${joinArgs(args)})`,
    MarketFactoryExpiredPt: (...args) => `Got MarketFactoryExpiredPt error (${joinArgs(args)})`,
    MarketFactoryInvalidPt: (...args) => `Got MarketFactoryInvalidPt error (${joinArgs(args)})`,
    MarketFactoryMarketExists: (...args) => `Got MarketFactoryMarketExists error (${joinArgs(args)})`,
    MarketInsufficientPtForTrade: (...args) => `Got MarketInsufficientPtForTrade error (${joinArgs(args)})`,
    MarketInsufficientPtReceived: (...args) => `Got MarketInsufficientPtReceived error (${joinArgs(args)})`,
    MarketInsufficientSyReceived: (...args) => `Got MarketInsufficientSyReceived error (${joinArgs(args)})`,
    MarketProportionMustNotEqualOne: (...args) => `Got MarketProportionMustNotEqualOne error (${joinArgs(args)})`,
    MarketProportionTooHigh: (...args) => `Got MarketProportionTooHigh error (${joinArgs(args)})`,
    MarketRateScalarBelowZero: (...args) => `Got MarketRateScalarBelowZero error (${joinArgs(args)})`,
    MarketScalarRootBelowZero: (...args) => `Got MarketScalarRootBelowZero error (${joinArgs(args)})`,
    MarketZeroAmountsInput: (...args) => `Got MarketZeroAmountsInput error (${joinArgs(args)})`,
    MarketZeroAmountsOutput: (...args) => `Got MarketZeroAmountsOutput error (${joinArgs(args)})`,
    MarketZeroLnImpliedRate: (...args) => `Got MarketZeroLnImpliedRate error (${joinArgs(args)})`,
    MarketZeroTotalPtOrTotalAsset: (...args) => `Got MarketZeroTotalPtOrTotalAsset error (${joinArgs(args)})`,
    MsgNotFromReceiveEndpoint: (...args) => `Got MsgNotFromReceiveEndpoint error (${joinArgs(args)})`,
    MsgNotFromSendEndpoint: (...args) => `Got MsgNotFromSendEndpoint error (${joinArgs(args)})`,
    OnlyCelerBus: (...args) => `Got OnlyCelerBus error (${joinArgs(args)})`,
    OnlyWhitelisted: (...args) => `Got OnlyWhitelisted error (${joinArgs(args)})`,
    OnlyYCFactory: (...args) => `Got OnlyYCFactory error (${joinArgs(args)})`,
    OnlyYT: (...args) => `Got OnlyYT error (${joinArgs(args)})`,
    OracleTargetTooOld: (...args) => `Got OracleTargetTooOld error (${joinArgs(args)})`,
    OracleUninitialized: (...args) => `Got OracleUninitialized error (${joinArgs(args)})`,
    OracleZeroCardinality: (...args) => `Got OracleZeroCardinality error (${joinArgs(args)})`,
    RouterCallbackNotPendleMarket: (...args) => `Got RouterCallbackNotPendleMarket error (${joinArgs(args)})`,
    RouterExceededLimitPtIn: (...args) => `Got RouterExceededLimitPtIn error (${joinArgs(args)})`,
    RouterExceededLimitSyIn: (...args) => `Got RouterExceededLimitSyIn error (${joinArgs(args)})`,
    RouterExceededLimitYtIn: (...args) => `Got RouterExceededLimitYtIn error (${joinArgs(args)})`,
    RouterInsufficientLpOut: (...args) => `Got RouterInsufficientLpOut error (${joinArgs(args)})`,
    RouterInsufficientPYOut: (...args) => `Got RouterInsufficientPYOut error (${joinArgs(args)})`,
    RouterInsufficientPtOut: (...args) => `Got RouterInsufficientPtOut error (${joinArgs(args)})`,
    RouterInsufficientPtRepay: (...args) => `Got RouterInsufficientPtRepay error (${joinArgs(args)})`,
    RouterInsufficientSyOut: (...args) => `Got RouterInsufficientSyOut error (${joinArgs(args)})`,
    RouterInsufficientSyRepay: (...args) => `Got RouterInsufficientSyRepay error (${joinArgs(args)})`,
    RouterInsufficientTokenOut: (...args) => `Got RouterInsufficientTokenOut error (${joinArgs(args)})`,
    RouterInsufficientYtOut: (...args) => `Got RouterInsufficientYtOut error (${joinArgs(args)})`,
    RouterInvalidAction: (...args) => `Got RouterInvalidAction error (${joinArgs(args)})`,
    RouterTimeRangeZero: (...args) => `Got RouterTimeRangeZero error (${joinArgs(args)})`,
    SYCurve3crvPoolNotFound: (...args) => `Got SYCurve3crvPoolNotFound error (${joinArgs(args)})`,
    SYCurveInvalidPid: (...args) => `Got SYCurveInvalidPid error (${joinArgs(args)})`,
    SYInsufficientSharesOut: (...args) => `Got SYInsufficientSharesOut error (${joinArgs(args)})`,
    SYInsufficientTokenOut: (...args) => `Got SYInsufficientTokenOut error (${joinArgs(args)})`,
    SYInvalidTokenIn: (...args) => `Got SYInvalidTokenIn error (${joinArgs(args)})`,
    SYInvalidTokenOut: (...args) => `Got SYInvalidTokenOut error (${joinArgs(args)})`,
    SYQiTokenBorrowRateTooHigh: (...args) => `Got SYQiTokenBorrowRateTooHigh error (${joinArgs(args)})`,
    SYQiTokenMintFailed: (...args) => `Got SYQiTokenMintFailed error (${joinArgs(args)})`,
    SYQiTokenRedeemFailed: (...args) => `Got SYQiTokenRedeemFailed error (${joinArgs(args)})`,
    SYQiTokenRedeemRewardsFailed: (...args) => `Got SYQiTokenRedeemRewardsFailed error (${joinArgs(args)})`,
    SYZeroDeposit: (...args) => `Got SYZeroDeposit error (${joinArgs(args)})`,
    SYZeroRedeem: (...args) => `Got SYZeroRedeem error (${joinArgs(args)})`,
    VCEpochNotFinalized: (...args) => `Got VCEpochNotFinalized error (${joinArgs(args)})`,
    VCExceededMaxWeight: (...args) => `Got VCExceededMaxWeight error (${joinArgs(args)})`,
    VCInactivePool: (...args) => `Got VCInactivePool error (${joinArgs(args)})`,
    VCPoolAlreadyActive: (...args) => `Got VCPoolAlreadyActive error (${joinArgs(args)})`,
    VCPoolAlreadyAddAndRemoved: (...args) => `Got VCPoolAlreadyAddAndRemoved error (${joinArgs(args)})`,
    VCZeroVePendle: (...args) => `Got VCZeroVePendle error (${joinArgs(args)})`,
    VEExceededMaxLockTime: (...args) => `Got VEExceededMaxLockTime error (${joinArgs(args)})`,
    VEInsufficientLockTime: (...args) => `Got VEInsufficientLockTime error (${joinArgs(args)})`,
    VEInvalidNewExpiry: (...args) => `Got VEInvalidNewExpiry error (${joinArgs(args)})`,
    VENotAllowedReduceExpiry: (...args) => `Got VENotAllowedReduceExpiry error (${joinArgs(args)})`,
    VEPositionNotExpired: (...args) => `Got VEPositionNotExpired error (${joinArgs(args)})`,
    VEZeroAmountLocked: (...args) => `Got VEZeroAmountLocked error (${joinArgs(args)})`,
    VEZeroPosition: (...args) => `Got VEZeroPosition error (${joinArgs(args)})`,
    VEZeroSlope: (...args) => `Got VEZeroSlope error (${joinArgs(args)})`,
    YCExpired: (...args) => `Got YCExpired error (${joinArgs(args)})`,
    YCFactoryInvalidExpiry: (...args) => `Got YCFactoryInvalidExpiry error (${joinArgs(args)})`,
    YCFactoryYieldContractExisted: (...args) => `Got YCFactoryYieldContractExisted error (${joinArgs(args)})`,
    YCNoFloatingSy: (...args) => `Got YCNoFloatingSy error (${joinArgs(args)})`,
    YCNotExpired: (...args) => `Got YCNotExpired error (${joinArgs(args)})`,
    YCNothingToRedeem: (...args) => `Got YCNothingToRedeem error (${joinArgs(args)})`,
    YCPostExpiryDataNotSet: (...args) => `Got YCPostExpiryDataNotSet error (${joinArgs(args)})`,
    YieldContractInsufficientSy: (...args) => `Got YieldContractInsufficientSy error (${joinArgs(args)})`,
    ZeroAddress: (...args) => `Got ZeroAddress error (${joinArgs(args)})`,
};
