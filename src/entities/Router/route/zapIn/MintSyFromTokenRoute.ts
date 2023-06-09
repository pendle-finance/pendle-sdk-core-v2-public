import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount, isNativeToken } from '../../../../common';

export type MintSyFromTokenRouteData = BaseZapInRouteData & {
    netSyOut: BN;
    minSyOut: BN;
};

export class MintSyFromTokenRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    MintSyFromTokenRouteData,
    MintSyFromTokenRoute<T>
> {
    /**
     * @param sy Should be the same as params.context.syEntity.address.
     * This field is redundant to keep the same signature as the correesponding method of {@link Router}.
     */
    constructor(
        readonly sy: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<T, MintSyFromTokenRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller = true): MintSyFromTokenRoute<T> {
        return new MintSyFromTokenRoute(this.sy, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netSyOut;
    }

    protected override async previewWithRouterStatic(): Promise<MintSyFromTokenRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }

        const netSyOut = await this.context.syEntity.previewDeposit(
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            { ...this.routerExtraParams.forCallStatic, bulk: input.bulk }
        );
        const minSyOut = calcSlippedDownAmount(netSyOut, this.slippage);
        return { netSyOut, minSyOut, intermediateSyAmount: netSyOut };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'mintSyFromToken',
        MintSyFromTokenRouteData & { route: MintSyFromTokenRoute<T> }
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
        const { minSyOut } = previewResult;
        const overrides = { value: isNativeToken(this.tokenIn) ? this.netTokenIn : undefined };
        return this.router.contract.metaCall.mintSyFromToken(params.receiver, this.sy, minSyOut, input, {
            ...data,
            ...mergeMetaMethodExtraParams({ overrides }, params),
        });
    }
}
