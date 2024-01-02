import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmountSqrt, NoArgsCache } from '../../../../common';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import { txOverridesValueFromTokenInput } from '../helper';

export type AddLiquiditySingleTokenKeepYtRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netYtOut: BN;
    netSyMinted: BN;
    netSyToPY: BN;
    minLpOut: BN;
    minYtOut: BN;
    afterMath: offchainMath.MarketStaticMath;
};

export type AddLiquiditySingleTokenKeepYtRouteConfig<
    SelfType extends BaseAddLiquiditySingleTokenKeepYtRoute<SelfType>
> = BaseZapInRouteConfig<SelfType>;

export type AddLiquiditySingleTokenKeepYtRouteDebugInfo = ZapInRouteDebugInfo & {
    marketAddress: Address;
    tokenIn: Address;

    // force BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export abstract class BaseAddLiquiditySingleTokenKeepYtRoute<
    SelfType extends BaseAddLiquiditySingleTokenKeepYtRoute<SelfType>
> extends BaseZapInRoute<AddLiquiditySingleTokenKeepYtRouteData, SelfType> {
    override readonly routeName = 'AddLiquiditySingleTokenKeepYt';

    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenKeepYtRouteConfig<SelfType>
    ) {
        super(params);
        const other = params.cloneFrom;
        if (other != undefined) {
            /* eslint-disable @typescript-eslint/unbound-method */
            NoArgsCache.copyValue(this, other, BaseAddLiquiditySingleTokenKeepYtRoute.prototype.getAggregatorResult);
            NoArgsCache.copyValue(this, other, BaseAddLiquiditySingleTokenKeepYtRoute.prototype.buildTokenInput);
            /* eslint-enable @typescript-eslint/unbound-method */
        }
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenKeepYtRouteData | undefined> {
        const [input, mintedSyAmount, marketStaticMath] = await Promise.all([
            this.buildTokenInput(),
            this.getMintedSyAmount(),
            this.getMarketStaticMath(),
        ]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }
        const data = marketStaticMath.addLiquiditySingleSyKeepYtStatic(BN.from(mintedSyAmount).toBigInt());
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        const minYtOut = calcSlippedDownAmountSqrt(data.netYtOut, this.slippage);
        return {
            netLpOut: BN.from(data.netLpOut),
            netYtOut: BN.from(data.netYtOut),
            netSyMinted: mintedSyAmount,
            netSyToPY: BN.from(data.netSyToPY),
            afterMath: data.afterMath,
            intermediateSyAmount: mintedSyAmount,
            minLpOut,
            minYtOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    /**
     * @see {@link BaseRouter#addLiquiditySingleTokenKeepYt} for the
     * explanation of the return type.
     */
    async buildCall(): Promise<
        RouterMetaMethodReturnType<
            'meta-method',
            'addLiquiditySingleTokenKeepYt',
            AddLiquiditySingleTokenKeepYtRouteData & {
                route: SelfType;
            }
        >
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall(
            { ...previewResult, route: this as unknown as SelfType },
            this.routerExtraParams
        );
        return res!;
    }

    /**
     * @privateRemarks
     *
     * ### TypeScript type inference
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
        const [previewResult, input] = await Promise.all([this.preview(), this.buildTokenInput()]);
        if (!previewResult || !input) return undefined;
        const overrides = txOverridesValueFromTokenInput(input);
        const { minLpOut, minYtOut } = previewResult;
        return this.router.contract.metaCall.addLiquiditySingleTokenKeepYt(
            params.receiver,
            this.market,
            minLpOut,
            minYtOut,
            input,
            { ...data, ...mergeMetaMethodExtraParams(params, { overrides }) }
        );
    }

    async getMinLpOut() {
        return (await this.preview())?.minLpOut;
    }

    async getMinYtOut() {
        return (await this.preview())?.minYtOut;
    }

    override async gatherDebugInfo(): Promise<AddLiquiditySingleTokenKeepYtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            marketAddress: this.market,
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
            tokenIn: this.tokenIn,
        };
    }
}

export class AddLiquiditySingleTokenKeepYtRoute extends BaseAddLiquiditySingleTokenKeepYtRoute<AddLiquiditySingleTokenKeepYtRoute> {}
