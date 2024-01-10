import {
    MetaMethodType,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
    MetaMethodExtraParams,
    typechain,
} from '../../contracts';
import { Address, BigNumberish, ChainId } from '../../common';
import { BytesLike } from 'ethers';
import { PendleEntityConfigOptionalAbi } from '../PendleEntity';
import { GasFeeEstimator } from './GasFeeEstimator';

import type { IPAllActionV3 } from '@pendle/core-v2/typechain-types/IPAllActionV3';
import { AggregatorHelper } from './aggregatorHelper';
import { LimitOrderMatcher } from './limitOrder';

export type { ApproxParamsStruct, IPAllActionV3 } from '@pendle/core-v2/typechain-types/IPAllActionV3';
import * as tsEssentials from 'ts-essentials';
import * as errors from '../../errors';
import * as routerComponents from './components';
import * as route from './route';

/**
 * Reflecting [`AGGREGATOR`](https://github.com/pendle-finance/pendle-core-v2/blob/c6f6000a6f682a2bff41b7a7cce78e36fb497e8e/contracts/router/swap-aggregator/ISwapAggregator.sol#L10) type.
 */
export enum SwapType {
    NONE = 0,
    KYBERSWAP = 1,
    ONE_INCH = 2,
    ETH_WETH = 3,
}

/**
 * Reflecting `SwapDataStruct` in {@link IPAllAction}
 */
export type SwapData = {
    swapType: SwapType;
    extRouter: Address;
    extCalldata: BytesLike;
    needScale: boolean;
};

/**
 *Reflecting `TokenInputStruct` in {@link IPAllAction}
 */
export type TokenInput = {
    tokenIn: Address;
    netTokenIn: BigNumberish;
    tokenMintSy: Address;
    pendleSwap: Address;
    swapData: SwapData;
};

/**
 *Reflecting `TokenOutputStruct` in {@link IPAllAction}
 */
export type TokenOutput = {
    tokenOut: Address;
    minTokenOut: BigNumberish;
    tokenRedeemSy: Address;
    pendleSwap: Address;
    swapData: SwapData;
};

export type BaseRouterConfig = PendleEntityConfigOptionalAbi & {
    chainId: ChainId;
    gasFeeEstimator?: GasFeeEstimator;
    checkErrorOnSimulation?: boolean;

    // components
    aggregatorHelper?: AggregatorHelper;
    limitOrderMatcher?: LimitOrderMatcher;
    tokenAmountConverter?: routerComponents.TokenAmountConverter;
    optimalOutputRouteSelector?: routerComponents.OptimalOutputRouteSelector;
    limitOrderRouteSelector?: routerComponents.LimitOrderRouteSelector;
    approxParamsGenerator?: routerComponents.ApproxParamsGenerator;
};

export type RouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver?: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    aggregatorReceiver?: Address;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllActionV3>,
    Data extends object = object,
> = MetaMethodReturnType<T, IPAllActionV3, M, Data & RouterMetaMethodExtraParams<T>>;

export type RouterHelperMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<typechain.PendleRouterHelper>,
    Data extends object,
> = MetaMethodReturnType<T, typechain.PendleRouterHelper, M, Data & RouterMetaMethodExtraParams<T>>;

export type MetaMethodForRouterMethod<Method extends tsEssentials.AnyFunction> =
    ReturnType<Method> extends RouterMetaMethodReturnType<any, infer M, infer Data>
        ? Awaited<RouterMetaMethodReturnType<'meta-method', M, Data>>
        : ReturnType<Method> extends RouterHelperMetaMethodReturnType<any, infer M, infer Data>
          ? Awaited<RouterHelperMetaMethodReturnType<'meta-method', M, Data>>
          : never;

export type FixedRouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    entityConfig: BaseRouterConfig;
    aggregatorReceiver: Address;

    // this is a copy of this type, but used for the inner callStatic to calculate stuff
    forCallStatic: Omit<FixedRouterMetaMethodExtraParams<T>, 'forCallStatic' | 'method'>;
};

export type AnyRouterContractMetaMethod<Data extends object = object> = ContractMetaMethod<
    IPAllActionV3,
    ContractMethodNames<IPAllActionV3>,
    Data
>;
export type AnyRouterHelperContractMetaMethod<Data extends object = object> = ContractMetaMethod<
    typechain.PendleRouterHelper,
    ContractMethodNames<typechain.PendleRouterHelper>,
    Data
>;

export type RouterEvents = {
    calculationFinalized: (params: {
        metaMethod: AnyRouterContractMetaMethod | AnyRouterHelperContractMetaMethod;
    }) => void;

    noRouteFound: (params: {
        actionName: string;
        from: Address;
        to: Address;
        routes: route.Route.AnyRoute[];
        errorOptions?: errors.PendleSdkErrorParams;
    }) => void;
};
