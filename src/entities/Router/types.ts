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

import type { IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import { AggregatorHelper } from './aggregatorHelper';

export type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import * as tsEssentials from 'ts-essentials';

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
    bulk: Address;
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
    bulk: Address;
    pendleSwap: Address;
    swapData: SwapData;
};

export type BaseRouterConfig = PendleEntityConfigOptionalAbi & {
    chainId: ChainId;
    gasFeeEstimator?: GasFeeEstimator;
    aggregatorHelper: AggregatorHelper;
};

export type RouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver?: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    aggregatorReceiver?: Address;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllAction>,
    Data extends {}
> = MetaMethodReturnType<T, IPAllAction, M, Data & RouterMetaMethodExtraParams<T>>;

export type RouterHelperMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<typechain.PendleRouterHelper>,
    Data extends {}
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
