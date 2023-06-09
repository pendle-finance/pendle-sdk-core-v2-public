// This file is generated via `yarn generatePendleContractErrorMessageHandler`
import { type BigNumber as BN, BytesLike } from 'ethers';
import { Address } from '../common';

/**
 * This type is generated from the ABI of Pendle contract Errors.
 *
 * @see https://github.com/pendle-finance/pendle-core-internal-v2/blob/main/contracts/core/libraries/Errors.sol
 */

export type PendleContractErrorMessageHandler = {
    ApproxBinarySearchInputInvalid: (
        approxGuessMin: BN,
        approxGuessMax: BN,
        minGuessMin: BN,
        maxGuessMax: BN
    ) => string;
    ApproxDstExecutionGasNotSet: () => string;
    ApproxFail: () => string;
    ApproxParamsInvalid: (guessMin: BN, guessMax: BN, eps: BN) => string;
    ArrayEmpty: () => string;
    ArrayLengthMismatch: () => string;
    ArrayOutOfBounds: () => string;
    BDInvalidEpoch: (epoch: BN, startTime: BN) => string;
    BulkBadRateSyToToken: (actualRate: BN, currentRate: BN, eps: BN) => string;
    BulkBadRateTokenToSy: (actualRate: BN, currentRate: BN, eps: BN) => string;
    BulkInSufficientSyOut: (actualSyOut: BN, requiredSyOut: BN) => string;
    BulkInSufficientTokenOut: (actualTokenOut: BN, requiredTokenOut: BN) => string;
    BulkInsufficientSyForTrade: (currentAmount: BN, requiredAmount: BN) => string;
    BulkInsufficientSyReceived: (actualBalance: BN, requiredBalance: BN) => string;
    BulkInsufficientTokenForTrade: (currentAmount: BN, requiredAmount: BN) => string;
    BulkNotAdmin: () => string;
    BulkNotMaintainer: () => string;
    BulkSellerAlreadyExisted: (token: Address, SY: Address, bulk: Address) => string;
    BulkSellerInvalidToken: (token: Address, SY: Address) => string;
    ChainNotSupported: (chainId: BN) => string;
    ExpiryInThePast: (expiry: BN) => string;
    FDEpochLengthMismatch: () => string;
    FDFutureFunding: (lastFunded: BN, currentWTime: BN) => string;
    FDInvalidNewFinishedEpoch: (oldFinishedEpoch: BN, newFinishedEpoch: BN) => string;
    FDInvalidPool: (pool: Address) => string;
    FDInvalidStartEpoch: (startEpoch: BN) => string;
    FDInvalidWTimeFund: (lastFunded: BN, wTime: BN) => string;
    FDPoolAlreadyExists: (pool: Address) => string;
    FDTotalAmountFundedNotMatch: (actualTotalAmount: BN, expectedTotalAmount: BN) => string;
    FailedToSendEther: () => string;
    GCNotPendleMarket: (caller: Address) => string;
    GCNotVotingController: (caller: Address) => string;
    InsufficientFeeToSendMsg: (currentFee: BN, requiredFee: BN) => string;
    InvalidMerkleProof: () => string;
    InvalidRetryData: () => string;
    InvalidWTime: (wTime: BN) => string;
    MarketExchangeRateBelowOne: (exchangeRate: BN) => string;
    MarketExpired: () => string;
    MarketFactoryExpiredPt: () => string;
    MarketFactoryInitialAnchorTooLow: (initialAnchor: BN, minInitialAnchor: BN) => string;
    MarketFactoryInvalidPt: () => string;
    MarketFactoryLnFeeRateRootTooHigh: (lnFeeRateRoot: BN, maxLnFeeRateRoot: BN) => string;
    MarketFactoryMarketExists: () => string;
    MarketFactoryReserveFeePercentTooHigh: (reserveFeePercent: BN, maxReserveFeePercent: BN) => string;
    MarketFactoryZeroTreasury: () => string;
    MarketInsufficientPtForTrade: (currentAmount: BN, requiredAmount: BN) => string;
    MarketInsufficientPtReceived: (actualBalance: BN, requiredBalance: BN) => string;
    MarketInsufficientSyReceived: (actualBalance: BN, requiredBalance: BN) => string;
    MarketProportionMustNotEqualOne: () => string;
    MarketProportionTooHigh: (proportion: BN, maxProportion: BN) => string;
    MarketRateScalarBelowZero: (rateScalar: BN) => string;
    MarketScalarRootBelowZero: (scalarRoot: BN) => string;
    MarketZeroAmountsInput: () => string;
    MarketZeroAmountsOutput: () => string;
    MarketZeroLnImpliedRate: () => string;
    MarketZeroTotalPtOrTotalAsset: (totalPt: BN, totalAsset: BN) => string;
    MsgNotFromReceiveEndpoint: (sender: Address) => string;
    MsgNotFromSendEndpoint: (srcChainId: BN, path: undefined) => string;
    OnlyLayerZeroEndpoint: () => string;
    OnlyWhitelisted: () => string;
    OnlyYCFactory: () => string;
    OnlyYT: () => string;
    OracleTargetTooOld: (target: BN, oldest: BN) => string;
    OracleUninitialized: () => string;
    OracleZeroCardinality: () => string;
    RouterCallbackNotPendleMarket: (caller: Address) => string;
    RouterExceededLimitPtIn: (actualPtIn: BN, limitPtIn: BN) => string;
    RouterExceededLimitSyIn: (actualSyIn: BN, limitSyIn: BN) => string;
    RouterExceededLimitYtIn: (actualYtIn: BN, limitYtIn: BN) => string;
    RouterInsufficientLpOut: (actualLpOut: BN, requiredLpOut: BN) => string;
    RouterInsufficientPYOut: (actualPYOut: BN, requiredPYOut: BN) => string;
    RouterInsufficientPtOut: (actualPtOut: BN, requiredPtOut: BN) => string;
    RouterInsufficientPtRepay: (actualPtRepay: BN, requiredPtRepay: BN) => string;
    RouterInsufficientSyOut: (actualSyOut: BN, requiredSyOut: BN) => string;
    RouterInsufficientSyRepay: (actualSyRepay: BN, requiredSyRepay: BN) => string;
    RouterInsufficientTokenOut: (actualTokenOut: BN, requiredTokenOut: BN) => string;
    RouterInsufficientYtOut: (actualYtOut: BN, requiredYtOut: BN) => string;
    RouterInvalidAction: (selector: BytesLike) => string;
    RouterInvalidFacet: (facet: Address) => string;
    RouterKyberSwapDataZero: () => string;
    RouterNotAllSyUsed: (netSyDesired: BN, netSyUsed: BN) => string;
    RouterTimeRangeZero: () => string;
    SAInsufficientTokenIn: (tokenIn: Address, amountExpected: BN, amountActual: BN) => string;
    SYApeDepositAmountTooSmall: (amountDeposited: BN) => string;
    SYBalancerInvalidPid: () => string;
    SYBalancerReentrancy: () => string;
    SYCurve3crvPoolNotFound: () => string;
    SYCurveInvalidPid: () => string;
    SYInsufficientSharesOut: (actualSharesOut: BN, requiredSharesOut: BN) => string;
    SYInsufficientTokenOut: (actualTokenOut: BN, requiredTokenOut: BN) => string;
    SYInvalidRewardToken: (token: Address) => string;
    SYInvalidTokenIn: (token: Address) => string;
    SYInvalidTokenOut: (token: Address) => string;
    SYQiTokenBorrowRateTooHigh: (borrowRate: BN, borrowRateMax: BN) => string;
    SYQiTokenMintFailed: (errCode: BN) => string;
    SYQiTokenRedeemFailed: (errCode: BN) => string;
    SYQiTokenRedeemRewardsFailed: (rewardAccruedType0: BN, rewardAccruedType1: BN) => string;
    SYStargateRedeemCapExceeded: (amountLpDesired: BN, amountLpRedeemable: BN) => string;
    SYZeroDeposit: () => string;
    SYZeroRedeem: () => string;
    UnsupportedSelector: (aggregatorType: BN, selector: BytesLike) => string;
    VCEpochNotFinalized: (wTime: BN) => string;
    VCExceededMaxWeight: (totalWeight: BN, maxWeight: BN) => string;
    VCInactivePool: (pool: Address) => string;
    VCPoolAlreadyActive: (pool: Address) => string;
    VCPoolAlreadyAddAndRemoved: (pool: Address) => string;
    VCZeroVePendle: (user: Address) => string;
    VEExceededMaxLockTime: () => string;
    VEInsufficientLockTime: () => string;
    VEInvalidNewExpiry: (newExpiry: BN) => string;
    VENotAllowedReduceExpiry: () => string;
    VEPositionNotExpired: () => string;
    VEReceiveOldSupply: (msgTime: BN) => string;
    VEZeroAmountLocked: () => string;
    VEZeroPosition: () => string;
    VEZeroSlope: (bias: BN, slope: BN) => string;
    YCExpired: () => string;
    YCFactoryInterestFeeRateTooHigh: (interestFeeRate: BN, maxInterestFeeRate: BN) => string;
    YCFactoryInvalidExpiry: () => string;
    YCFactoryRewardFeeRateTooHigh: (newRewardFeeRate: BN, maxRewardFeeRate: BN) => string;
    YCFactoryYieldContractExisted: () => string;
    YCFactoryZeroExpiryDivisor: () => string;
    YCFactoryZeroTreasury: () => string;
    YCNoFloatingSy: () => string;
    YCNotExpired: () => string;
    YCNothingToRedeem: () => string;
    YCPostExpiryDataNotSet: () => string;
    YieldContractInsufficientSy: (actualSy: BN, requiredSy: BN) => string;
    ZeroAddress: () => string;
};
