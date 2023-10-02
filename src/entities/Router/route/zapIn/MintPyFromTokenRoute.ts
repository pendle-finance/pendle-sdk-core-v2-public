import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount, ethersConstants } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';

export type MintPyFromTokenRouteData = BaseZapInRouteData & {
    netPyOut: BN;
    minPyOut: BN;
};

export type MintPyFromTokenRouteDebugInfo = ZapInRouteDebugInfo & {
    ytAddress: Address;
    // force BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export class MintPyFromTokenRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    MintPyFromTokenRouteData,
    MintPyFromTokenRoute<T>
> {
    override readonly routeName = 'MintPyFromToken';

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

    override routeWithBulkSeller(withBulkSeller = true): MintPyFromTokenRoute<T> {
        return new MintPyFromTokenRoute(this.yt, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netPyOut;
    }

    protected override async previewWithRouterStatic(): Promise<MintPyFromTokenRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const netPyOut = await this.routerStaticCall.mintPyFromSyStatic(
            this.yt,
            mintedSyAmount,
            this.routerExtraParams.forCallStatic
        );
        const minPyOut = calcSlippedDownAmount(netPyOut, this.slippage);
        return { netPyOut, minPyOut, intermediateSyAmount: ethersConstants.Zero };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
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
    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [input, previewResult] = await Promise.all([this.buildTokenInput(), this.preview()]);
        if (!input || !previewResult) return undefined;
        const overrides = txOverridesValueFromTokenInput(input);
        const { minPyOut } = previewResult;
        return this.router.contract.metaCall.mintPyFromToken(params.receiver, this.yt, minPyOut, input, {
            ...data,
            ...mergeMetaMethodExtraParams({ overrides }, params),
        });
    }

    override async gatherDebugInfo(): Promise<MintPyFromTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
            ytAddress: this.yt,
        };
    }
}
