// This file is intended to be used as module. See ./index.ts.
import * as common from '../../../../common';
import * as contractType from '@pendle/core-v2/typechain-types/IPAllActionV3';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export type RawOrderStruct = contractType.OrderStruct;

export type OrderStruct = common.AssertHasSameField<
    RawOrderStruct,
    {
        salt: common.BN;
        expiry: common.BN;
        nonce: common.BN;
        orderType: common.BN;
        token: common.Address;
        YT: common.Address;
        maker: common.Address;
        receiver: common.Address;
        makingAmount: common.BN;
        lnImpliedRate: offchainMath.FixedX18;
        failSafeRate: offchainMath.FixedX18;
        permit: common.BytesLike;
    }
>;

const _TYPED_DATA_OBJECT: Record<keyof OrderStruct, string> = {
    salt: 'uint256',
    expiry: 'uint256',
    nonce: 'uint256',
    orderType: 'uint8',
    token: 'address',
    YT: 'address',
    maker: 'address',
    receiver: 'address',
    makingAmount: 'uint256',
    lnImpliedRate: 'uint256',
    failSafeRate: 'uint256',
    permit: 'bytes',
};

export const TYPED_DATA_FIELDS = {
    Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'orderType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'YT', type: 'address' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'makingAmount', type: 'uint256' },
        { name: 'lnImpliedRate', type: 'uint256' },
        { name: 'failSafeRate', type: 'uint256' },
        { name: 'permit', type: 'bytes' }, // On first fill: permit.1.call(abi.encodePacked(permit.selector, permit.2))
    ],
};

export type CreateParams = common.PropUnion<OrderStruct, RawOrderStruct>;

export function create(rawOrder: CreateParams): OrderStruct {
    return {
        salt: common.BN.from(rawOrder.salt),
        expiry: common.BN.from(rawOrder.expiry),
        nonce: common.BN.from(rawOrder.nonce),
        orderType: common.BN.from(rawOrder.orderType),
        token: common.toAddress(rawOrder.token),
        YT: common.toAddress(rawOrder.YT),
        maker: common.toAddress(rawOrder.maker),
        receiver: common.toAddress(rawOrder.receiver),
        makingAmount: common.BN.from(rawOrder.makingAmount),
        lnImpliedRate: offchainMath.FixedX18.isFixedX18(rawOrder.lnImpliedRate)
            ? rawOrder.lnImpliedRate
            : offchainMath.FixedX18.fromRawValue(common.BN.from(rawOrder.lnImpliedRate).toBigInt()),
        failSafeRate: offchainMath.FixedX18.isFixedX18(rawOrder.failSafeRate)
            ? rawOrder.failSafeRate
            : offchainMath.FixedX18.fromRawValue(common.BN.from(rawOrder.failSafeRate).toBigInt()),
        permit: rawOrder.permit,
    };
}

export function toRaw(data: OrderStruct): RawOrderStruct {
    return {
        ...data,
        lnImpliedRate: data.lnImpliedRate.value,
        failSafeRate: data.failSafeRate.value,
    };
}
