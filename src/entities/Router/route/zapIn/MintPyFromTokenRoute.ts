import { YtEntity } from '../../../YtEntity';
import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount } from '../../../../common';
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

export class MintPyFromTokenRoute extends BaseZapInRoute<MintPyFromTokenRouteData, MintPyFromTokenRoute> {
    override readonly routeName = 'MintPyFromToken';
    readonly yt: Address;

    constructor(
        readonly ytEntity: YtEntity,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<MintPyFromTokenRoute>
    ) {
        super(params);
        this.yt = ytEntity.address;
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netPyOut;
    }

    protected override async previewWithRouterStatic(): Promise<MintPyFromTokenRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const netPyOut = await this.ytEntity.previewMintPyFromSy(mintedSyAmount, this.routerExtraParams.forCallStatic);
        const minPyOut = calcSlippedDownAmount(netPyOut, this.slippage);
        return { netPyOut, minPyOut, intermediateSyAmount: mintedSyAmount };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'mintPyFromToken',
        MintPyFromTokenRouteData & { route: MintPyFromTokenRoute }
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
