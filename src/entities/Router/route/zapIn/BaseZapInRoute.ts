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
import { txOverridesValueFromTokenInput } from '../helper';

export type BaseZapInRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseZapInRoute<T, BaseZapInRouteData, SelfType>
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
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.getMintedSyAmountWithRouter);
                NoArgsCache.copyValue(this, other, BaseZapInRoute.prototype.getMintedSyAmountWithRouterStatic);
            }
            /* eslint-disable @typescript-eslint/unbound-method */
        }
    }

    abstract readonly sourceTokenAmount: RawTokenAmount<BigNumberish>;
    protected abstract previewWithRouterStatic(): Promise<Data | undefined>;

    override async getSourceTokenAmount() {
        return this.sourceTokenAmount;
    }
    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, this.sourceTokenAmount);
    }

    /**
     * Alias name
     */
    getIntermediateSyAmount() {
        return this.getMintedSyAmount();
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
        return {
            netTokenIn: calcSlippedUpAmount(BN.from(aggregatorResult.outputAmount), this.context.getBulkBuffer()),
            netSyIn: BN.from(0),
        };
    }

    override get tokenBulk(): Address {
        return this.tokenMintSy;
    }

    /**
     * @privateRemarks
     * The passing `syncAfterAggregatorCall` should not affect the preview logic
     * in order to be cached
     */
    @NoArgsCache
    async preview(): Promise<Data | undefined> {
        const res = await this.previewWithRouterStatic();
        return res;
    }

    getNeedScale() {
        return false;
    }

    @NoArgsCache
    async getAggregatorResult() {
        return this.aggregatorHelper.makeCall(
            this.sourceTokenAmount,
            this.tokenMintSy,
            this.context.aggregatorSlippage,
            {
                aggregatorReceiver: this.routerExtraParams.aggregatorReceiver,
                needScale: this.getNeedScale(),
            }
        );
    }

    @NoArgsCache
    async buildTokenInput(): Promise<TokenInput | undefined> {
        const [aggregatorResult, bulk] = await Promise.all([this.getAggregatorResult(), this.getUsedBulk()]);
        const swapData = aggregatorResult.createSwapData({ needScale: this.getNeedScale() });
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
        return (await this.getAggregatorResult()).outputAmount;
    }

    @NoArgsCache
    async getMintedSyAmount(): Promise<BN | undefined> {
        return this.getMintedSyAmountWithRouter().then((value) => value ?? this.getMintedSyAmountWithRouterStatic());
    }

    @NoArgsCache
    async getMintedSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenInput] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildTokenInput(),
        ]);
        if (!signerAddress || !tokenInput) return undefined;
        return this.router.contract.callStatic.mintSyFromToken(
            signerAddress,
            this.syEntity.address,
            ethersConstants.Zero,
            tokenInput,
            txOverridesValueFromTokenInput(tokenInput)
        );
    }

    @NoArgsCache
    async getMintedSyAmountWithRouterStatic(): Promise<BN | undefined> {
        const [tokenMintSyAmount, bulk] = await Promise.all([this.getTokenMintSyAmount(), this.getUsedBulk()]);
        if (!tokenMintSyAmount) return undefined;
        return this.routerStatic.multicallStatic.mintSyFromTokenStatic(
            this.syEntity.address,
            this.tokenMintSy,
            tokenMintSyAmount,
            bulk
        );
    }

    override async gatherDebugInfo(): Promise<ZapInRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            type: 'zapIn',
            tokenMintSy: this.tokenMintSy,
        };
    }
}
