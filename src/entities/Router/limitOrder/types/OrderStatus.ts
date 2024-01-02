import * as common from '../../../../common';
import * as OrderStruct from './OrderStruct';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export class OrderStatus {
    constructor(
        readonly order: OrderStruct.OrderStruct,
        readonly remaining: common.BN,
        readonly filledAmount: common.BN,
        readonly makerNonce: common.BN
    ) {}

    static create(
        order: OrderStruct.CreateParams,
        remaining: common.BigNumberish,
        filledAmount: common.BigNumberish,
        makerNonce: common.BigNumberish
    ) {
        return new OrderStatus(
            OrderStruct.create(order),
            common.BN.from(remaining),
            common.BN.from(filledAmount),
            common.BN.from(makerNonce)
        );
    }

    get isCanceled(): boolean {
        return (
            this.order.makingAmount.gt(this.remaining.add(this.filledAmount)) || this.order.nonce.lt(this.makerNonce)
        );
    }

    get isExpired(): boolean {
        return this.order.expiry.mul(1000).lt(Date.now());
    }

    get isActive(): boolean {
        return !this.isCanceled && !this.isExpired;
    }

    get progress(): number {
        return offchainMath.FixedX18.divDown(
            this.filledAmount.toBigInt(),
            this.order.makingAmount.toBigInt()
        ).toNumber();
    }
}
