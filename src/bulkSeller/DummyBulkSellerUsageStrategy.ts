import { BulkSellerUsageBaseStrategy } from './BulkSellerUsageBaseStrategy';
import { BN, BigNumberish, RawTokenAmount, Address } from '../types';
import { RouterStatic, WrappedContract } from '../contracts';
import { NATIVE_ADDRESS_0x00 } from '../constants';

export class DummyBulkSellerUsageStrategy extends BulkSellerUsageBaseStrategy {
    readonly thresHold: BN;
    constructor(thresHold: BigNumberish, routerStatic: WrappedContract<RouterStatic>) {
        super(routerStatic);
        this.thresHold = BN.from(thresHold);
    }

    protected override async determineByTokenLogic(
        bulkSellerAddress: Address,
        tokenTradeAmount: RawTokenAmount<BigNumberish>
    ): Promise<Address> {
        return this.thresHold.gte(tokenTradeAmount.amount) ? bulkSellerAddress : NATIVE_ADDRESS_0x00;
    }

    protected override async determineBySyLogic(
        bulkSellerAddress: Address,
        syTradeAmount: RawTokenAmount<BigNumberish>
    ): Promise<Address> {
        return this.thresHold.gte(syTradeAmount.amount) ? bulkSellerAddress : NATIVE_ADDRESS_0x00;
    }
}

export class NeverUseBulkSellerUsageStrategy extends BulkSellerUsageBaseStrategy {
    protected override async determineByTokenLogic(): Promise<Address> {
        return NATIVE_ADDRESS_0x00;
    }

    protected override async determineBySyLogic(): Promise<Address> {
        return NATIVE_ADDRESS_0x00;
    }
}
