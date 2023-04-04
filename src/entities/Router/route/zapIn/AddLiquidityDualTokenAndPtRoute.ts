import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, isNativeToken, calcSlippedDownAmountSqrt } from '../../../../common';

export type AddLiquidityDualTokenAndPtRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netTokenUsed: BN;
    netPtUsed: BN;
    netSyUsed: BN;
    netSyDesired: BN;
};

export class AddLiquidityDualTokenAndPtRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    AddLiquidityDualTokenAndPtRouteData,
    AddLiquidityDualTokenAndPtRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly tokenDesired: BigNumberish,
        readonly ptDesired: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<T, AddLiquidityDualTokenAndPtRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.tokenDesired };
    }

    override routeWithBulkSeller(withBulkSeller = true): AddLiquidityDualTokenAndPtRoute<T> {
        return new AddLiquidityDualTokenAndPtRoute(
            this.market,
            this.tokenIn,
            this.tokenDesired,
            this.ptDesired,
            this.slippage,
            {
                context: this.context,
                tokenMintSy: this.tokenMintSy,
                withBulkSeller,
                cloneFrom: this,
            }
        );
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquidityDualTokenAndPtRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }
        const data = await this.routerStaticCall.addLiquidityDualTokenAndPtStatic(
            this.market,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.ptDesired,
            this.routerExtraParams.forCallStatic
        );
        return {
            ...data,
            intermediateSyAmount: data.netSyDesired,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return await this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'addLiquidityDualTokenAndPt',
        AddLiquidityDualTokenAndPtRouteData & {
            route: AddLiquidityDualTokenAndPtRoute<T>;
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
        const [input, previewResult] = await Promise.all([this.buildTokenInput(), this.preview()]);
        if (!input || !previewResult) return undefined;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.tokenDesired : undefined };
        const minLpOut = calcSlippedDownAmountSqrt(previewResult.netLpOut, this.slippage);
        return this.router.contract.metaCall.addLiquidityDualTokenAndPt(
            this.routerExtraParams.receiver,
            this.market,
            input,
            this.ptDesired,
            minLpOut,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }
}
