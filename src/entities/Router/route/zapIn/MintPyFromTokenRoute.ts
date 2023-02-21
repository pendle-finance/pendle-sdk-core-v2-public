import { BaseZapInRoute, BaseZapInRouteConfig } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams, TokenInput } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount, isNativeToken } from '../../../../common';
import { KybercallData } from '../../../KyberHelper';

export type MintPyFromTokenRouteData = {
    netPyOut: BN;

    /** @deprecated use Route API instead */
    input: TokenInput;
    /** @deprecated use Route API instead */
    kybercallData: KybercallData;
};

export class MintPyFromTokenRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    MintPyFromTokenRouteData,
    MintPyFromTokenRoute<T>
> {
    constructor(
        readonly yt: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<T, MintPyFromTokenRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): MintPyFromTokenRoute<T> {
        return new MintPyFromTokenRoute(this.yt, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(syncAfterAggregatorCall?: () => Promise<void>): Promise<BN | undefined> {
        return (await this.preview(syncAfterAggregatorCall))?.netPyOut;
    }

    protected override async previewWithRouterStatic(): Promise<MintPyFromTokenRouteData | undefined> {
        const input = await this.buildTokenInput();
        if (!input) {
            return undefined;
        }

        const netPyOut = await this.routerStaticCall.mintPYFromBaseStatic(
            this.yt,
            this.tokenMintSy,
            await this.getTokenMintSyAmount(),
            input.bulk,
            this.routerExtraParams.forCallStatic
        );
        return {
            netPyOut,

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
        'mintPyFromToken',
        MintPyFromTokenRouteData & { route: MintPyFromTokenRoute<T> }
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
        const minPyOut = calcSlippedDownAmount(previewResult.netPyOut, this.slippage);
        return this.router.contract.metaCall.mintPyFromToken(params.receiver, this.yt, minPyOut, input, {
            ...data,
            ...mergeMetaMethodExtraParams({ overrides }, params),
        });
    }
}