import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, isNativeToken, calcSlippedDownAmountSqrt } from '../../../../common';

export type AddLiquiditySingleTokenRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netPtFromSwap: BN;
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
    netSyMinted: BN;
    netSyToSwap: BN;
    minLpOut: BN;
};

export type AddLiquiditySingleTokenRouteConfig<T extends MetaMethodType> = BaseZapInRouteConfig<
    T,
    AddLiquiditySingleTokenRoute<T>
>;

export class AddLiquiditySingleTokenRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    AddLiquiditySingleTokenRouteData,
    AddLiquiditySingleTokenRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenRouteConfig<T>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller = true): AddLiquiditySingleTokenRoute<T> {
        return new AddLiquiditySingleTokenRoute(this.market, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }

        const data = await this.routerStaticCall.addLiquiditySingleTokenStatic(
            this.market,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.routerExtraParams.forCallStatic
        );
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        return {
            ...data,
            intermediateSyAmount: data.netSyMinted,
            minLpOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return await this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleToken',
        AddLiquiditySingleTokenRouteData & {
            route: AddLiquiditySingleTokenRoute<T>;
        }
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
        const [previewResult, approxParam, input] = await Promise.all([
            this.preview(),
            this.getApproxParam(),
            this.buildTokenInput(),
        ]);
        if (!previewResult || !approxParam || !input) return undefined;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.netTokenIn : undefined };
        const { minLpOut } = previewResult;
        return this.router.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            this.market,
            minLpOut,
            approxParam,
            input,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }

    async getApproxParam() {
        const previewResult = await this.preview();
        if (!previewResult) return undefined;
        return this.context.getApproxParamsToPullPt(previewResult.netPtFromSwap, this.slippage);
    }

    async getMinLpOut() {
        return (await this.preview())?.minLpOut;
    }
}
