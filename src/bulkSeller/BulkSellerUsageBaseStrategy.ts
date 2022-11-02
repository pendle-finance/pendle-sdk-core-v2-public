import { RawTokenAmount, BigNumberish, Address } from '../types';

// TODO come up with a better type instead of boolean.
// Using boolean has an advantages, because it is be readable:
// - useBulk: true
// - useBulk: false
// - useBulk: 'auto'
// but mixed type is not desirable
export type UseBulkMode = boolean | 'auto';

export interface BulkSellerUsageStrategy {
    determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<boolean>;

    determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<boolean>;
}

export abstract class BulkSellerUsageBaseStrategy implements BulkSellerUsageStrategy {
    async determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<boolean> {
        if (typeof useBulk === 'boolean') {
            return useBulk;
        }
        return this.determineByTokenLogic(tokenTradeAmount, syAddress);
    }

    async determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<boolean> {
        if (typeof useBulk === 'boolean') {
            return useBulk;
        }
        return this.determineBySyLogic(syTradeAmount, tokenAddress);
    }

    protected abstract determineByTokenLogic(
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<boolean>;
    protected abstract determineBySyLogic(
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<boolean>;
}
