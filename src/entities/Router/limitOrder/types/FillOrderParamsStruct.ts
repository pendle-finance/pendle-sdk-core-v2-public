// This file is intended to be used as module. See ./index.ts
//
import * as common from '../../../../common';
import * as contractType from '@pendle/core-v2/typechain-types/IPAllActionV3';
import * as OrderStruct from './OrderStruct';

export type RawFillOrderParamsStruct = contractType.FillOrderParamsStruct;

export type FillOrderParamsStruct = common.AssertHasSameField<
    RawFillOrderParamsStruct,
    {
        order: OrderStruct.OrderStruct;
        signature: common.BytesLike;
        makingAmount: common.BN;
    }
>;

export type CreateParams = common.PropUnion<RawFillOrderParamsStruct, FillOrderParamsStruct> & {
    order: OrderStruct.CreateParams;
};

export function create(params: CreateParams): FillOrderParamsStruct {
    return {
        order: OrderStruct.create(params.order),
        signature: params.signature,
        makingAmount: common.BN.from(params.makingAmount),
    };
}

export function toRaw(data: FillOrderParamsStruct): RawFillOrderParamsStruct {
    return {
        order: OrderStruct.toRaw(data.order),
        signature: data.signature,
        makingAmount: data.makingAmount,
    };
}
