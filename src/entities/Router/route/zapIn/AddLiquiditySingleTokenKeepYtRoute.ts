import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, isNativeToken, calcSlippedDownAmountSqrt } from '../../../../common';

export type AddLiquiditySingleTokenKeepYtRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netYtOut: BN;
    netSyMinted: BN;
    netSyToPY: BN;
};

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
        params: BaseZapInRouteConfig<T, AddLiquiditySingleTokenKeepYtRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): AddLiquiditySingleTokenKeepYtRoute<T> {
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

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return await this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleTokenKeepYt',
        AddLiquiditySingleTokenKeepYtRouteData & {
            route: AddLiquiditySingleTokenKeepYtRoute<T>;
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
     *
     */
    protected async buildGenericCall<Data extends {}, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [previewResult, input] = await Promise.all([this.preview(), this.buildTokenInput()]);
        if (!previewResult || !input) return undefined;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.netTokenIn : undefined };
        const minLpOut = calcSlippedDownAmountSqrt(previewResult.netLpOut, this.slippage);
        const minYtOut = calcSlippedDownAmountSqrt(previewResult.netYtOut, this.slippage);
        return this.router.contract.metaCall.addLiquiditySingleTokenKeepYt(
            params.receiver,
            this.market,
            minLpOut,
            minYtOut,
            input,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }
}
