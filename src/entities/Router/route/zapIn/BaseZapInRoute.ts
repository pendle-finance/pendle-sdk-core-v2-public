import {
    RawTokenAmount,
    BigNumberish,
    Address,
    ethersConstants,
    NoArgsCache,
    calcSlippedUpAmount,
    BN,
    NATIVE_ADDRESS_0xEE,
    bnSafeDiv,
} from '../../../../common';
import { MetaMethodType } from '../../../../contracts';
import { TokenInput } from '../../types';
import { BaseRoute, BaseRouteConfig } from '../BaseRoute';
import { RouteContext } from '../RouteContext';

export type BaseZapInRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseZapInRoute<T, any, SelfType>
> = BaseRouteConfig<T, SelfType> & {
    readonly tokenMintSy: Address;
};

export abstract class BaseZapInRoute<
    T extends MetaMethodType,
    Data,
    SelfType extends BaseZapInRoute<T, Data, SelfType>
> extends BaseRoute<T, SelfType> {
    readonly tokenMintSy: Address;

    constructor(params: BaseZapInRouteConfig<T, SelfType>) {
        super(params);
        ({ tokenMintSy: this.tokenMintSy } = params);
        const other = params.cloneFrom;
        if (other != undefined) {
            // Can we somehow automate this?
            NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.getAggregatorResult);

            if (this.routeWithBulkSeller === other.routeWithBulkSeller) {
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.preview);
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.buildTokenInput);
            }
        }
    }

    abstract readonly sourceTokenAmount: RawTokenAmount<BigNumberish>;
    protected abstract previewWithRouterStatic(): Promise<Data | undefined>;

    override async estimateNetOutInEth(): Promise<BN | undefined> {
        const [curNetOut, maxNetOut, sourceTokenAmountInEth] = await Promise.all([
            this.getNetOut(),
            this.context.getMaxOutAmongAllRoutes(),
            this.estimateSourceTokenAmountInEth(),
        ]);
        if (curNetOut === undefined || maxNetOut === undefined || sourceTokenAmountInEth === undefined) {
            return undefined;
        }

        // the result will be
        //      curNetOut * theoreticalPrice
        //
        // where `theoreticalPrice` is
        //      sourceTokenAmountInEth / maxNetOut
        return bnSafeDiv(curNetOut.mul(sourceTokenAmountInEth), maxNetOut);
    }

    @RouteContext.NoArgsSharedCache
    async estimateSourceTokenAmountInEth(): Promise<BN | undefined> {
        const DUMMY_SLIPPAGE = 0.2 / 100;
        const result = await this.aggregatorHelper.makeCall(
            this.sourceTokenAmount,
            NATIVE_ADDRESS_0xEE,
            DUMMY_SLIPPAGE
        );
        return result ? BN.from(result.outputAmount) : undefined;
    }

    protected override async getTokenAmountForBulkTrade(): Promise<{ netTokenIn: BN; netSyIn: BN } | undefined> {
        const aggregatorResult = await this.getAggregatorResult();
        if (!aggregatorResult) {
            return undefined;
        }
        return {
            netTokenIn: calcSlippedUpAmount(BN.from(aggregatorResult.outputAmount), this.context.bulkBuffer),
            netSyIn: BN.from(0),
        };
    }

    override get tokenBulk(): Address {
        return this.tokenMintSy;
    }

    /**
     * @param syncAfterAggregatorCall Used for micro optimization in
     * There are two steps in {@link preview}.
     *
     * 1. Call {@link buildTokenInput} to get the {@link TokenInput} struct for
     *    contract call.
     * 2. Call the corresponding contract function.
     *
     * To use {@link Multicall} effectively for the step 2, all simutenious
     * calls should have synchronized after step 1. After every calls done with
     * the step 1, they can call the contract function. Because of
     * synchronization, these calls are being invoked **together**.
     *
     * So {@link preview} will call {@link buildTokenInput} first, then call
     * `syncAfterAggregatorCall` for synchronization. The cached result from
     * {@link buildTokenInput} can then be used to avoid recalculation.
     *
     * @privateRemarks
     * The passing `syncAfterAggregatorCall` should not affect the preview logic
     * in order to be cached
     */
    @NoArgsCache
    async preview(syncAfterAggregatorCall: () => Promise<void> = () => Promise.resolve()): Promise<Data | undefined> {
        await this.buildTokenInput();
        await syncAfterAggregatorCall();
        const res = await this.previewWithRouterStatic();
        return res;
    }

    @NoArgsCache
    async getAggregatorResult() {
        return this.aggregatorHelper.makeCall(
            this.sourceTokenAmount,
            this.tokenMintSy,
            this.context.aggregatorSlippage,
            { receiver: this.routerExtraParams.aggregatorReceiver }
        );
    }

    @NoArgsCache
    async buildTokenInput(): Promise<TokenInput | undefined> {
        const [aggregatorResult, bulk] = await Promise.all([this.getAggregatorResult(), this.getUsedBulk()]);
        if (aggregatorResult === undefined) {
            return undefined;
        }
        const input: TokenInput = {
            tokenIn: this.sourceTokenAmount.token,
            netTokenIn: this.sourceTokenAmount.amount,
            tokenMintSy: this.tokenMintSy,
            kybercall: aggregatorResult.encodedSwapData,
            bulk,
            kyberRouter: aggregatorResult.routerAddress,
        };
        return input;
    }

    /**
     * @return
     * - {@link ethersConstants.MaxUint256} if result if {@link this.getAggregatorResult} is `undefined`.
     * - `outputAmount` of {@link this.getAggregatorResult}() otherwise.
     *
     * {@link ethersConstants.MaxUint256} is returned instead of `undefined` to have less
     * code dealing with type assertion.
     */
    async getTokenMintSyAmount(): Promise<BigNumberish> {
        return (await this.getAggregatorResult())?.outputAmount ?? ethersConstants.MaxUint256;
    }
}