import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';

export type SwapExactTokenForYtRouteData = BaseZapInRouteData & {
    netYtOut: BN;
    netSyMinted: BN;
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
    minYtOut: BN;
};

export type SwapExactTokenForYtRouteDebugInfo = ZapInRouteDebugInfo & {
    market: Address;
    tokenIn: Address;
    // cast BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export class SwapExactTokenForYtRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    SwapExactTokenForYtRouteData,
    SwapExactTokenForYtRoute<T>
> {
    override readonly routeName = 'SwapExactTokenForYt';

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

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netYtOut;
    }

    protected override async previewWithRouterStatic(): Promise<SwapExactTokenForYtRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const data = await this.routerStaticCall.swapExactSyForYtStatic(
            this.market,
            mintedSyAmount,
            this.routerExtraParams.forCallStatic
        );
        const minYtOut = calcSlippedDownAmount(data.netYtOut, this.slippage);
        return {
            ...data,
            intermediateSyAmount: mintedSyAmount,
            netSyMinted: mintedSyAmount,
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
        const overrides = txOverridesValueFromTokenInput(input);
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

    override async gatherDebugInfo(): Promise<SwapExactTokenForYtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.market,
            tokenIn: this.tokenIn,
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
        };
    }
}
