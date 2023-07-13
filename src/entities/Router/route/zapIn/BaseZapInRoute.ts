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
import { BaseRoute, BaseRouteConfig, RouteDebugInfo } from '../BaseRoute';
import { RouteContext } from '../RouteContext';

export type BaseZapInRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseZapInRoute<T, any, SelfType>
> = BaseRouteConfig<T, SelfType> & {
    readonly tokenMintSy: Address;
};

export type ZapInRouteDebugInfo = RouteDebugInfo & {
    type: 'zapIn';
    tokenMintSy: Address;
};

export type BaseZapInRouteData = {
    intermediateSyAmount: BN;
};

export abstract class BaseZapInRoute<
    T extends MetaMethodType,
    Data extends BaseZapInRouteData,
    SelfType extends BaseZapInRoute<T, Data, SelfType>
> extends BaseRoute<T, SelfType> {
    readonly tokenMintSy: Address;

    constructor(params: BaseZapInRouteConfig<T, SelfType>) {
        super(params);
        ({ tokenMintSy: this.tokenMintSy } = params);
        const other = params.cloneFrom;
        if (other != undefined) {
            /* eslint-disable @typescript-eslint/unbound-method */
            // Can we somehow automate this?
            NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.getAggregatorResult);

            if (this.withBulkSeller === other.withBulkSeller) {
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.preview);
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.buildTokenInput);
            }
            /* eslint-disable @typescript-eslint/unbound-method */
        }
    }

    abstract readonly sourceTokenAmount: RawTokenAmount<BigNumberish>;
    protected abstract previewWithRouterStatic(): Promise<Data | undefined>;

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, this.sourceTokenAmount);
    }

    override async estimateNetOutInEth(): Promise<BN | undefined> {
        const [curNetOut, maxNetOut, sourceTokenAmountInEth] = await Promise.all([
            this.getNetOut(),
            this.context.getMaxOutAmongAllRoutes(),
            this.estimateSourceTokenAmountInEth(),
        ]);
        if (curNetOut === undefined || maxNetOut === undefined) {
            return undefined;
        }

        // the result will be
        //      curNetOut * theoreticalPrice
        //
        // where `theoreticalPrice` is
        //      sourceTokenAmountInEth / maxNetOut
        return bnSafeDiv(curNetOut.mul(sourceTokenAmountInEth), maxNetOut);
    }

    /**
     * Estimate the amount of source token in term of ETH
     *
     * @remarks
     * If the source token is not swappable to ETH, it will return 0.
     */
    @RouteContext.NoArgsSharedCache
    async estimateSourceTokenAmountInEth(): Promise<BN> {
        const DUMMY_SLIPPAGE = 0.2 / 100;
        try {
            const { outputAmount } = await this.aggregatorHelper.makeCall(
                this.sourceTokenAmount,
                NATIVE_ADDRESS_0xEE,
                DUMMY_SLIPPAGE
            );
            return outputAmount;
        } catch {
            return BN.from(0);
        }
    }

    override async getTokenAmountForBulkTrade(): Promise<{ netTokenIn: BN; netSyIn: BN } | undefined> {
        const aggregatorResult = await this.getAggregatorResult();
        if (!aggregatorResult) {
            return undefined;
        }
        return {
            netTokenIn: calcSlippedUpAmount(BN.from(aggregatorResult.outputAmount), this.context.getBulkBuffer()),
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
        const [res] = await Promise.all([
            this.previewWithRouterStatic(),

            // Currently unused for routing algorithm, but it is useful _elsewhere_.
            // Calling it here to batch it with multicall, then cache it.
            this.routerExtraParams.multicall != undefined ? this.getMintedSyAmount() : undefined,
        ]);
        return res;
    }

    async getIntermediateSyAmount(): Promise<BN | undefined> {
        const data = await this.preview();
        return data?.intermediateSyAmount;
    }

    @NoArgsCache
    async getAggregatorResult() {
        return this.aggregatorHelper.makeCall(
            this.sourceTokenAmount,
            this.tokenMintSy,
            this.context.aggregatorSlippage,
            { aggregatorReceiver: this.routerExtraParams.aggregatorReceiver }
        );
    }

    @NoArgsCache
    async buildTokenInput(): Promise<TokenInput | undefined> {
        const [aggregatorResult, bulk] = await Promise.all([this.getAggregatorResult(), this.getUsedBulk()]);
        if (aggregatorResult === undefined) {
            return undefined;
        }
        const swapData = aggregatorResult.createSwapData({ needScale: false });
        const pendleSwap = this.router.getPendleSwapAddress(swapData.swapType);
        const input: TokenInput = {
            tokenIn: this.sourceTokenAmount.token,
            netTokenIn: this.sourceTokenAmount.amount,
            tokenMintSy: this.tokenMintSy,
            bulk,
            pendleSwap,
            swapData,
        };
        return input;
    }

    /**
     * @return
     * - {@link ethersConstants.Zero} if result if {@link this.getAggregatorResult} is `undefined`.
     * - `outputAmount` of {@link this.getAggregatorResult}() otherwise.
     *
     * {@link ethersConstants.Zero} is returned instead of `undefined` to have less
     * code dealing with type assertion.
     */
    async getTokenMintSyAmount(): Promise<BigNumberish> {
        return (await this.getAggregatorResult())?.outputAmount ?? ethersConstants.Zero;
    }

    @NoArgsCache
    async getMintedSyAmount() {
        const [tokenMintSyAmount, bulk] = await Promise.all([this.getTokenMintSyAmount(), this.getUsedBulk()]);
        return this.syEntity.previewDeposit(this.tokenMintSy, tokenMintSyAmount, {
            ...this.routerExtraParams,
            bulk,
        });
    }

    override async gatherDebugInfo(): Promise<ZapInRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            type: 'zapIn',
            tokenMintSy: this.tokenMintSy,
        };
    }
}
