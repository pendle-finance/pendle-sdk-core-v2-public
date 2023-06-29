import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, isNativeToken, calcSlippedDownAmount } from '../../../../common';

export type SwapExactTokenForYtRouteData = BaseZapInRouteData & {
    netYtOut: BN;
    netSyMinted: BN;
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
    minYtOut: BN;
};

export class SwapExactTokenForYtRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    SwapExactTokenForYtRouteData,
    SwapExactTokenForYtRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<T, SwapExactTokenForYtRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller = true): SwapExactTokenForYtRoute<T> {
        return new SwapExactTokenForYtRoute(this.market, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netYtOut;
    }

    protected override async previewWithRouterStatic(): Promise<SwapExactTokenForYtRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }

        const data = await this.routerStaticCall.swapExactTokenForYtStatic(
            this.market,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.routerExtraParams.forCallStatic
        );
        const minYtOut = calcSlippedDownAmount(data.netYtOut, this.slippage);
        return {
            ...data,
            intermediateSyAmount: data.netSyMinted,
            minYtOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForYt',
        SwapExactTokenForYtRouteData & { route: SwapExactTokenForYtRoute<T> }
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall({ ...previewResult, route: this }, this.routerExtraParams);
        return res!;
    }

    /**
     * @privateRemarks
     * This method does not have a specified return type. This is **intended**,
     * as typescript version < 5 still has _bug_ in their type checker (for
     * example {@link https://github.com/microsoft/TypeScript/issues/52096}).
     *
     * The type binder somehow still work fine, so for now we can let tsc do
     * the typing for us.
     */
    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [input, previewResult] = await Promise.all([this.buildTokenInput(), this.preview()]);
        if (!input || !previewResult) return undefined;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.netTokenIn : undefined };
        const { minYtOut } = previewResult;
        const approxParam = this.context.getApproxParamsToPullPt(previewResult.netYtOut, this.slippage);

        return this.router.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            this.market,
            minYtOut,
            approxParam,
            input,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }
}
