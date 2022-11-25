import { RouterStatic, WrappedContract } from '../contracts';
import { PendleContractError } from '../errors';
import { RawTokenAmount, Address, NATIVE_ADDRESS_0x00, toAddress, BigNumberish, BN } from '../common';

/**
 * Mode to use with BulkSellerUsageStrategy:
 * - `true`: force using bulkseller
 * - `false`: force NOT using bulkseller
 * - `'auto'`: let the SDK handle the usage
 * - `{ withAddress }`: try using a custom bulkseller with a custom address
 * - `{ withStrategy }`: try using a custom strategy rather than the given one
 * - '{ withResult }': use the calculated result
 */
export type UseBulkMode =
    | boolean
    | 'auto'
    | { withAddress: Address }
    | { withStrategy: BulkSellerUsageStrategy }
    | { withResult: BulkSellerUsageResult };
export type TradeVolume = { totalSy: BN; totalToken: BN };

export class BulkSellerUsageResult {
    constructor(readonly bulkAddress: Address, private forceNoRetryWhenInvoke: boolean = false) {}

    async tryInvoke<T>(callback: (bulkAddress: Address) => Promise<T>, noRetry?: boolean) {
        if (this.forceNoRetryWhenInvoke) {
            noRetry = true;
        }
        try {
            return callback(this.bulkAddress);
        } catch (e: any) {
            if (
                !noRetry &&
                this.bulkAddress !== NATIVE_ADDRESS_0x00 &&
                e instanceof PendleContractError &&
                (e.isType('BulkInsufficientTokenForTrade') || e.isType('BulkInsufficientSyForTrade'))
            ) {
                return callback(NATIVE_ADDRESS_0x00);
            }
            throw e;
        }
    }
}

export interface BulkSellerUsageStrategy {
    determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<BulkSellerUsageResult>;

    determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<BulkSellerUsageResult>;
}

export abstract class BulkSellerUsageBaseStrategy implements BulkSellerUsageStrategy {
    constructor(readonly routerStatic: WrappedContract<RouterStatic>) {}

    shouldForceNoRetry(useBulk: UseBulkMode) {
        if (useBulk === 'auto') return false;
        if (typeof useBulk === 'object' && 'withStrategy' in useBulk) return false;
        return true;
    }

    async determineByToken(
        useBulk: UseBulkMode,
        tokenTradeAmount: RawTokenAmount<BigNumberish>,
        syAddress: Address
    ): Promise<BulkSellerUsageResult> {
        const shouldForceNoRetry = this.shouldForceNoRetry(useBulk);
        if (typeof useBulk === 'object') {
            if ('withResult' in useBulk) {
                return useBulk.withResult;
            }
            if ('withStrategy' in useBulk) {
                return useBulk.withStrategy.determineByToken('auto', tokenTradeAmount, syAddress);
            }
            const bulkAddress = await this.determineByTokenLogic(useBulk.withAddress, tokenTradeAmount, syAddress);
            return new BulkSellerUsageResult(bulkAddress, shouldForceNoRetry);
        }
        if (useBulk === false) {
            return new BulkSellerUsageResult(NATIVE_ADDRESS_0x00, shouldForceNoRetry);
        }
        const { bulk, totalToken, totalSy } = await this.routerStatic.multicallStatic[
            'getBulkSellerInfo(address,address,uint256,uint256)'
        ](tokenTradeAmount.token, syAddress, tokenTradeAmount.amount, 0);
        let bulkAddress = toAddress(bulk);
        if (useBulk !== true) {
            bulkAddress = await this.determineByTokenLogic(bulkAddress, tokenTradeAmount, syAddress, {
                totalToken,
                totalSy,
            });
        }
        return new BulkSellerUsageResult(bulkAddress, shouldForceNoRetry);
    }

    async determineBySy(
        useBulk: UseBulkMode,
        syTradeAmount: RawTokenAmount<BigNumberish>,
        tokenAddress: Address
    ): Promise<BulkSellerUsageResult> {
        const shouldForceNoRetry = this.shouldForceNoRetry(useBulk);
        if (typeof useBulk === 'object') {
            if ('withResult' in useBulk) {
                return useBulk.withResult;
            }
            if ('withStrategy' in useBulk) {
                return useBulk.withStrategy.determineBySy('auto', syTradeAmount, tokenAddress);
            }
            const bulkAddress = await this.determineBySyLogic(useBulk.withAddress, syTradeAmount, tokenAddress);
            return new BulkSellerUsageResult(bulkAddress, shouldForceNoRetry);
        }
        if (useBulk === false) {
            return new BulkSellerUsageResult(NATIVE_ADDRESS_0x00, shouldForceNoRetry);
        }
        const { bulk, totalToken, totalSy } = await this.routerStatic.multicallStatic[
            'getBulkSellerInfo(address,address,uint256,uint256)'
        ](tokenAddress, syTradeAmount.token, 0, syTradeAmount.amount);
        let bulkAddress = toAddress(bulk);
        if (useBulk !== true) {
            bulkAddress = await this.determineBySyLogic(bulkAddress, syTradeAmount, tokenAddress, {
                totalToken,
                totalSy,
            });
        }
        return new BulkSellerUsageResult(bulkAddress, shouldForceNoRetry);
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
