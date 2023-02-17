import {
    MetaMethodType,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
    MetaMethodExtraParams,
} from '../../contracts';
import { UseBulkMode, BulkSellerUsageStrategy } from '../../bulkSeller';
import { Address, BigNumberish, ChainId } from '../../common';
import { BytesLike } from 'ethers';
import { KyberState, KyberHelperCoreConfig } from '../KyberHelper';
import { PendleEntityConfigOptionalAbi } from '../PendleEntity';
import { GasFeeEstimator } from './GasFeeEstimator';

import type { IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';

export type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';

export type TokenInput = {
    tokenIn: Address;
    netTokenIn: BigNumberish;
    tokenMintSy: Address;
    bulk: Address;
    kyberRouter: Address;
    kybercall: BytesLike;
};

export type TokenOutput = {
    tokenOut: Address;
    minTokenOut: BigNumberish;
    tokenRedeemSy: Address;
    bulk: Address;
    kyberRouter: Address;
    kybercall: BytesLike;
};

export type RouterState = {
    kyberHelper: KyberState;
};

export type RouterConfig = PendleEntityConfigOptionalAbi & {
    chainId: ChainId;
    kyberHelper?: KyberHelperCoreConfig;
    bulkSellerUsage?: BulkSellerUsageStrategy;
    gasFeeEstimator?: GasFeeEstimator;
};

export type RouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver?: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    useBulk?: UseBulkMode;
    aggregatorReceiver?: Address;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllAction>,
    Data extends {}
> = MetaMethodReturnType<T, IPAllAction, M, Data & RouterMetaMethodExtraParams<T>>;

export type FixedRouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    useBulk: UseBulkMode;
    entityConfig: RouterConfig;
    aggregatorReceiver: Address;

    // this is a copy of this type, but used for the inner callStatic to calculate stuff
    forCallStatic: Omit<FixedRouterMetaMethodExtraParams<T>, 'forCallStatic' | 'method'>;
};
