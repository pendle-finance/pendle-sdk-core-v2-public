import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import {
    RouterMetaMethodReturnType,
    RouterHelperMetaMethodReturnType,
    FixedRouterMetaMethodExtraParams,
} from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import {
    Address,
    BigNumberish,
    BN,
    isNativeToken,
    calcSlippedDownAmountSqrt,
    getContractAddresses,
    NoArgsCache,
} from '../../../../common';

export type AddLiquiditySingleTokenKeepYtRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netYtOut: BN;
    netSyMinted: BN;
    netSyToPY: BN;
};

export type AddLiquiditySingleTokenKeepYtRouteConfig<T extends MetaMethodType> = BaseZapInRouteConfig<
    T,
    AddLiquiditySingleTokenKeepYtRoute<T>
>;

export class AddLiquiditySingleTokenKeepYtRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    AddLiquiditySingleTokenKeepYtRouteData,
    AddLiquiditySingleTokenKeepYtRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenKeepYtRouteConfig<T>
    ) {
        super(params);
        const other = params.cloneFrom;
        if (other != undefined) {
            if (this.withBulkSeller === other.withBulkSeller) {
                /* eslint-disable @typescript-eslint/unbound-method */
                NoArgsCache.copyValue(this, other, AddLiquiditySingleTokenKeepYtRoute.prototype.getAggregatorResult);
                NoArgsCache.copyValue(this, other, AddLiquiditySingleTokenKeepYtRoute.prototype.buildTokenInput);
                /* eslint-enable @typescript-eslint/unbound-method */
            }
        }
    }

    needPatch() {
        return isNativeToken(this.tokenIn);
    }

    get patchedTokenIn() {
        return this.needPatch() ? getContractAddresses(this.router.chainId).WRAPPED_NATIVE : this.tokenIn;
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    get patchedSourceTokenAmount() {
        return { token: this.patchedTokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller = true): AddLiquiditySingleTokenKeepYtRoute<T> {
        return new AddLiquiditySingleTokenKeepYtRoute(this.market, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenKeepYtRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }

        const data = await this.routerStaticCall.addLiquiditySingleTokenKeepYtStatic(
            this.market,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.routerExtraParams.forCallStatic
        );
        return {
            ...data,
            intermediateSyAmount: data.netSyMinted,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return await this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    /**
     * @see {@link BaseRouter#addLiquiditySingleTokenKeepYt} for the
     * explanation of the return type.
     */
    async buildCall(): Promise<
        | RouterMetaMethodReturnType<
              T,
              'addLiquiditySingleTokenKeepYt',
              AddLiquiditySingleTokenKeepYtRouteData & {
                  route: AddLiquiditySingleTokenKeepYtRoute<T>;
              }
          >
        | RouterHelperMetaMethodReturnType<
              T,
              'addLiquiditySingleTokenKeepYtWithEth',
              AddLiquiditySingleTokenKeepYtRouteData & {
                  route: AddLiquiditySingleTokenKeepYtRoute<T>;
              }
          >
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall({ ...previewResult, route: this }, this.routerExtraParams);
        return res!;
    }

    /**
     * @privateRemarks
     *
     * ### TypeScript type inference
     * This method does not have a specified return type. This is **intended**,
     * as typescript version < 5 still has _bug_ in their type checker (for
     * example {@link https://github.com/microsoft/TypeScript/issues/52096}).
     *
     * The type binder somehow still work fine, so for now we can let tsc do
     * the typing for us.
     *
     * ### `PendleRouterHelper` patch
     * See {@link BaseRouter#addLiquiditySingleTokenKeepYt} for the explanation
     * of the return type.
     */
    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [previewResult, input] = await Promise.all([this.preview(), this.buildTokenInput()]);
        if (!previewResult || !input) return undefined;
        const minLpOut = calcSlippedDownAmountSqrt(previewResult.netLpOut, this.slippage);
        const minYtOut = calcSlippedDownAmountSqrt(previewResult.netYtOut, this.slippage);
        if (!this.needPatch()) {
            return this.router.contract.metaCall.addLiquiditySingleTokenKeepYt(
                params.receiver,
                this.market,
                minLpOut,
                minYtOut,
                input,
                { ...data, ...params }
            );
        }
        const overrides = { value: this.netTokenIn };
        return this.router
            .getRouterHelper()
            .metaCall.addLiquiditySingleTokenKeepYtWithEth(params.receiver, this.market, minLpOut, minYtOut, input, {
                ...data,
                ...mergeMetaMethodExtraParams({ overrides }, params),
            });
    }

    async getMinLpOut() {
        const previewResult = await this.preview();
        if (!previewResult) return undefined;
        return calcSlippedDownAmountSqrt(previewResult.netLpOut, this.slippage);
    }

    async getMinYtOut() {
        const previewResult = await this.preview();
        if (!previewResult) return undefined;
        return calcSlippedDownAmountSqrt(previewResult.netYtOut, this.slippage);
    }

    @NoArgsCache
    async getAggregatorResult() {
        return this.aggregatorHelper.makeCall(
            this.patchedSourceTokenAmount,
            this.tokenMintSy,
            this.context.aggregatorSlippage,
            { aggregatorReceiver: this.routerExtraParams.aggregatorReceiver }
        );
    }

    @NoArgsCache
    override async buildTokenInput() {
        const res = await super.buildTokenInput();
        if (!res) return res;
        res.tokenIn = this.patchedTokenIn;
        return res;
    }
}
