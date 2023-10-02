import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
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
    minLpOut: BN;
    minYtOut: BN;
};

export type AddLiquiditySingleTokenKeepYtRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseAddLiquiditySingleTokenKeepYtRoute<T, SelfType>
> = BaseZapInRouteConfig<T, SelfType>;

export type AddLiquiditySingleTokenKeepYtRouteDebugInfo = ZapInRouteDebugInfo & {
    marketAddress: Address;
    tokenIn: Address;

    // force BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export abstract class BaseAddLiquiditySingleTokenKeepYtRoute<
    T extends MetaMethodType,
    SelfType extends BaseAddLiquiditySingleTokenKeepYtRoute<T, SelfType>
> extends BaseZapInRoute<T, AddLiquiditySingleTokenKeepYtRouteData, SelfType> {
    override readonly routeName = 'AddLiquiditySingleTokenKeepYt';

    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenKeepYtRouteConfig<T, SelfType>
    ) {
        super(params);
        const other = params.cloneFrom;
        if (other != undefined) {
            if (this.withBulkSeller === other.withBulkSeller) {
                /* eslint-disable @typescript-eslint/unbound-method */
                NoArgsCache.copyValue(
                    this,
                    other,
                    BaseAddLiquiditySingleTokenKeepYtRoute.prototype.getAggregatorResult
                );
                NoArgsCache.copyValue(this, other, BaseAddLiquiditySingleTokenKeepYtRoute.prototype.buildTokenInput);
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

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenKeepYtRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const data = await this.routerStaticCall.addLiquiditySingleSyKeepYtStatic(
            this.market,
            mintedSyAmount,
            this.routerExtraParams.forCallStatic
        );
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        const minYtOut = calcSlippedDownAmountSqrt(data.netYtOut, this.slippage);
        return {
            ...data,
            intermediateSyAmount: mintedSyAmount,
            netSyMinted: mintedSyAmount,
            minLpOut,
            minYtOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
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
                  route: SelfType;
              }
          >
        | RouterHelperMetaMethodReturnType<
              T,
              'addLiquiditySingleTokenKeepYtWithEth',
              AddLiquiditySingleTokenKeepYtRouteData & {
                  route: SelfType;
              }
          >
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall(
            { ...previewResult, route: this as unknown as SelfType },
            this.routerExtraParams
        );
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
        const { minLpOut, minYtOut } = previewResult;
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
        return (await this.preview())?.minLpOut;
    }

    async getMinYtOut() {
        return (await this.preview())?.minYtOut;
    }

    @NoArgsCache
    async getAggregatorResult() {
        return this.aggregatorHelper.makeCall(
            this.patchedSourceTokenAmount,
            this.tokenMintSy,
            this.context.aggregatorSlippage,
            { aggregatorReceiver: this.routerExtraParams.aggregatorReceiver, needScale: this.getNeedScale() }
        );
    }

    @NoArgsCache
    override async buildTokenInput() {
        const res = await super.buildTokenInput();
        if (!res) return res;
        res.tokenIn = this.patchedTokenIn;
        return res;
    }

    override async gatherDebugInfo(): Promise<AddLiquiditySingleTokenKeepYtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            marketAddress: this.market,
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
            tokenIn: this.tokenIn,
        };
    }
}

export class AddLiquiditySingleTokenKeepYtRoute<
    T extends MetaMethodType
> extends BaseAddLiquiditySingleTokenKeepYtRoute<T, AddLiquiditySingleTokenKeepYtRoute<T>> {
    override routeWithBulkSeller(withBulkSeller = true): AddLiquiditySingleTokenKeepYtRoute<T> {
        return new AddLiquiditySingleTokenKeepYtRoute(this.market, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }
}
