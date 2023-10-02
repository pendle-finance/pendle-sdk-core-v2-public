import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';

export type MintSyFromTokenRouteData = BaseZapInRouteData & {
    netSyOut: BN;
    minSyOut: BN;
};

export type MintSyFromTokenRouteDebugInfo = ZapInRouteDebugInfo & {
    syAddress: Address;

    // force BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export class MintSyFromTokenRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    MintSyFromTokenRouteData,
    MintSyFromTokenRoute<T>
> {
    override readonly routeName = 'MintSyFromToken';
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

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netSyOut;
    }

    protected override async previewWithRouterStatic(): Promise<MintSyFromTokenRouteData | undefined> {
        const mintedSyAmount = await this.getMintedSyAmount();
        if (!mintedSyAmount) return;
        const minSyOut = calcSlippedDownAmount(mintedSyAmount, this.slippage);
        return { netSyOut: mintedSyAmount, minSyOut, intermediateSyAmount: mintedSyAmount };
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
        const overrides = txOverridesValueFromTokenInput(input);
        return this.router.contract.metaCall.mintSyFromToken(params.receiver, this.sy, minSyOut, input, {
            ...data,
            ...mergeMetaMethodExtraParams({ overrides }, params),
        });
    }

    override async gatherDebugInfo(): Promise<MintSyFromTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            netTokenIn: String(this.netTokenIn),
            syAddress: this.sy,
            slippage: this.slippage,
        };
    }
}
