import { RawTokenAmount, BigNumberish, Address, BN } from '../types';
import { RouterStatic, WrappedContract } from '../contracts';
import { NATIVE_ADDRESS_0x00 } from '../constants';
import { PendleContractError } from '../errors';

/**
 * Mode to use with BulkSellerUsageStrategy
 * - true: force using bulkseller
 * - false: force NOT using bulkseller
 * - 'auto': let the SDK handle the usage
 * - { withAddress }: try using a custom bulkseller with a custom address
 * - { withStrategy }: try using a custom strategy rather than the given one
 */
export type UseBulkMode = boolean | 'auto' | { withAddress: Address } | { withStrategy: BulkSellerUsageStrategy };
export type TradeVolume = { totalSy: BN; totalToken: BN };

export interface BulkSellerUsageStrategy {
    tryInvoke<T>(
        bulkSellerAddress: Address,
        callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry?: boolean
    ): Promise<T>;

    tryInvokeWithToken<T>(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address,
        callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry?: boolean
    ): Promise<T>;

    tryInvokeWithSy<T>(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address,
        Callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry?: boolean
    ): Promise<T>;

    determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<Address>;

    determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<Address>;
}

export abstract class BulkSellerUsageBaseStrategy implements BulkSellerUsageStrategy {
    constructor(readonly routerStatic: WrappedContract<RouterStatic>) {}

    async tryInvoke<T>(
        bulkSellerAddress: Address,
        callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry: boolean = false
    ): Promise<T> {
        try {
            return callback(bulkSellerAddress);
        } catch (e: any) {
            if (
                !noRetry &&
                bulkSellerAddress !== NATIVE_ADDRESS_0x00 &&
                e instanceof PendleContractError &&
                (e.isType('BulkInsufficientTokenForTrade') || e.isType('BulkInsufficientSyForTrade'))
            ) {
                return callback(NATIVE_ADDRESS_0x00);
            }
            throw e;
        }
    }

    async tryInvokeWithToken<T>(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address,
        callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry: boolean = false
    ): Promise<T> {
        if (this.shouldForceNoRetry(useBulk)) {
            noRetry = true;
        }
        const bulkSellerAddress = await this.determineByToken(useBulk, tokenTradeAmount, syAddress);
        return this.tryInvoke(bulkSellerAddress, callback, noRetry);
    }

    async tryInvokeWithSy<T>(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address,
        callback: (bulkSellerAddress: Address) => Promise<T>,
        noRetry: boolean = false
    ): Promise<T> {
        if (this.shouldForceNoRetry(useBulk)) {
            noRetry = true;
        }
        const bulkSellerAddress = await this.determineBySy(useBulk, syTradeAmount, tokenAddress);
        return this.tryInvoke(bulkSellerAddress, callback, noRetry);
    }

    shouldForceNoRetry(useBulk: UseBulkMode) {
        if (useBulk === 'auto') return false;
        if (typeof useBulk === 'object' && 'withStrategy' in useBulk) return false;
        return true;
    }

    async determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<Address> {
        if (typeof useBulk === 'object') {
            if ('withStrategy' in useBulk) {
                return useBulk.withStrategy.determineByToken('auto', tokenTradeAmount, syAddress);
            }
            return this.determineByTokenLogic(useBulk.withAddress, tokenTradeAmount, syAddress);
        }
        if (useBulk === false) {
            return NATIVE_ADDRESS_0x00;
        }
        const { bulk, totalToken, totalSy } = await this.routerStatic.getBulkSellerInfo(
            tokenTradeAmount.token,
            syAddress
        );
        if (useBulk === true) {
            return bulk;
        }
        if (totalToken.lt(tokenTradeAmount.amount)) {
            return NATIVE_ADDRESS_0x00;
        }
        return this.determineByTokenLogic(bulk, tokenTradeAmount, syAddress, { totalToken, totalSy });
    }

    async determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<Address> {
        if (typeof useBulk === 'object') {
            if ('withStrategy' in useBulk) {
                return useBulk.withStrategy.determineBySy('auto', syTradeAmount, tokenAddress);
            }
            return this.determineBySyLogic(useBulk.withAddress, syTradeAmount, tokenAddress);
        }
        if (useBulk === false) {
            return NATIVE_ADDRESS_0x00;
        }
        const { bulk, totalToken, totalSy } = await this.routerStatic.getBulkSellerInfo(
            tokenAddress,
            syTradeAmount.token
        );
        if (useBulk === true) {
            return bulk;
        }
        if (totalSy.lt(syTradeAmount.amount)) {
            return NATIVE_ADDRESS_0x00;
        }
        return this.determineBySyLogic(bulk, syTradeAmount, tokenAddress, { totalToken, totalSy });
    }

    protected abstract determineByTokenLogic(
        bulkSellerAddress: Address,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address,
        tradeVolume?: TradeVolume
    ): Promise<Address>;

    protected abstract determineBySyLogic(
        bulkSellerAddress: Address,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address,
        tradeVolume?: TradeVolume
    ): Promise<Address>;
}
