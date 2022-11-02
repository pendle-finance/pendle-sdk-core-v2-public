import { BulkSellerUsageBaseStrategy } from './BulkSellerUsageBaseStrategy';
import { BN, BigNumberish, RawTokenAmount, Address } from '../types';

export class StupidBulkSellerUsageStrategy extends BulkSellerUsageBaseStrategy {
    readonly thresHold: BN;
    constructor(thresHold: BigNumberish) {
        super();
        this.thresHold = BN.from(thresHold);
    }

    protected override async determineByTokenLogic(
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        _syAddress: Address
    ): Promise<boolean> {
        return this.thresHold.gte(tokenTradeAmount.amount);
    }

    protected override async determineBySyLogic(
        syTradeAmount: RawTokenAmount<BigNumberish>,
        _tokenAddress: Address
    ): Promise<boolean> {
        return this.thresHold.gte(syTradeAmount.amount);
    }
}

export class NeverUseBulkSellerUsageStrategy extends BulkSellerUsageBaseStrategy {
    protected override async determineByTokenLogic(
        _tokenTradeAmount: RawTokenAmount<BigNumberish>,
        _syAddress: Address
    ): Promise<boolean> {
        return false;
    }

    protected override async determineBySyLogic(
        _syTradeAmount: RawTokenAmount<BigNumberish>,
        _tokenAddress: Address
    ): Promise<boolean> {
        return false;
    }
}
