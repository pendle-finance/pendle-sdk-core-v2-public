// This file is intended to be used as module. See ./index.ts

import * as common from '../../../../common';
import * as contractType from '@pendle/core-v2/typechain-types/IPAllActionV3';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as iters from 'itertools';
import * as typefest from 'type-fest';

import * as FillOrderParamsStruct from './FillOrderParamsStruct';

export type RawLimitOrderDataStruct = contractType.LimitOrderDataStruct;

export type LimitOrderDataStruct = Readonly<
    common.AssertHasSameField<
        RawLimitOrderDataStruct,
        {
            limitRouter: common.Address;
            epsSkipMarket: offchainMath.FixedX18;
            normalFills: FillOrderParamsStruct.FillOrderParamsStruct[];
            flashFills: FillOrderParamsStruct.FillOrderParamsStruct[];
            optData: common.BytesLike;
        }
    >
>;

export type CreateParams = typefest.SetOptional<
    typefest.Except<typefest.Merge<RawLimitOrderDataStruct, LimitOrderDataStruct>, 'normalFills' | 'flashFills'> & {
        normalFills: Iterable<FillOrderParamsStruct.CreateParams>;
        flashFills: Iterable<FillOrderParamsStruct.CreateParams>;
    },
    'optData'
>;

export function create(params: Readonly<CreateParams>): LimitOrderDataStruct {
    return {
        limitRouter: common.toAddress(params.limitRouter),
        epsSkipMarket: offchainMath.FixedX18.isFixedX18(params.epsSkipMarket)
            ? params.epsSkipMarket
            : offchainMath.FixedX18.fromRawValue(common.BN.from(params.epsSkipMarket).toBigInt()),
        normalFills: iters.map(params.normalFills, FillOrderParamsStruct.create),
        flashFills: iters.map(params.flashFills, FillOrderParamsStruct.create),
        optData: params.optData ?? '0x',
    };
}

export function toRaw(data: LimitOrderDataStruct): RawLimitOrderDataStruct {
    return {
        limitRouter: data.limitRouter,
        epsSkipMarket: data.epsSkipMarket.value,
        normalFills: data.normalFills.map(FillOrderParamsStruct.toRaw),
        flashFills: data.flashFills.map(FillOrderParamsStruct.toRaw),
        optData: data.optData,
    };
}
