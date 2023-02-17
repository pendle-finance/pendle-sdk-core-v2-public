import { BaseZapInRoute, BaseZapInRouteConfig } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams, TokenInput } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, isNativeToken, calcSlippedDownAmount } from '../../../../common';
import { KybercallData } from '../../../KyberHelper';

export type SwapExactTokenForYtRouteData = {
    netYtOut: BN;
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;

    /** @deprecated use Route API instead */
    input: TokenInput;
    /** @deprecated use Route API instead */
    kybercallData: KybercallData;
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

    override routeWithBulkSeller(withBulkSeller: boolean = true): SwapExactTokenForYtRoute<T> {
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

        const data = await this.routerStaticCall.swapExactBaseTokenForYtStatic(
            this.market,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.routerExtraParams.forCallStatic
        );
        return {
            ...data,

            // TODO remove these as deprecated
            input,
            kybercallData: (await this.getAggregatorResult())!,
        };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return await this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
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
    protected async buildGenericCall<Data extends {}, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [input, previewResult] = await Promise.all([this.buildTokenInput(), this.preview()]);
        if (!input || !previewResult) return undefined;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.netTokenIn : undefined };
        const minLpOut = calcSlippedDownAmount(previewResult.netYtOut, this.slippage);
        const approxParam = this.context.guessOutApproxParams(previewResult.netYtOut, this.slippage);

        return this.router.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            this.market,
            minLpOut,
            approxParam,
            input,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }
}
