import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmountSqrt, NATIVE_ADDRESS_0x00 } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';

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

export type AddLiquiditySingleTokenRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseAddLiquiditySingleTokenRoute<T, SelfType>
> = BaseZapInRouteConfig<T, SelfType>;

export type AddLiquiditySingleTokenRouteDebugInfo = ZapInRouteDebugInfo & {
    marketAddress: Address;
    tokenIn: Address;

    // force BigNumber to string for readability
    netTokenIn: string;

    slippage: number;
};

export abstract class BaseAddLiquiditySingleTokenRoute<
    T extends MetaMethodType,
    SelfType extends BaseAddLiquiditySingleTokenRoute<T, SelfType>
> extends BaseZapInRoute<T, AddLiquiditySingleTokenRouteData, SelfType> {
    override readonly routeName = 'AddLiquiditySingleToken';
    constructor(
        readonly market: Address,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenRouteConfig<T, SelfType>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const data = await this.routerStaticCall.addLiquiditySingleSyStatic(
            this.market,
            mintedSyAmount,
            this.routerExtraParams.forCallStatic
        );
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        return {
            ...data,
            intermediateSyAmount: mintedSyAmount,
            netSyMinted: mintedSyAmount,
            minLpOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleToken',
        AddLiquiditySingleTokenRouteData & {
            route: SelfType;
        }
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
        const overrides = txOverridesValueFromTokenInput(input);
        const { minLpOut } = previewResult;
        const res = await this.router.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            this.market,
            minLpOut,
            approxParam,
            input,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
        return res;
    }

    async getApproxParam() {
        const previewResult = await this.preview();
        if (!previewResult) return undefined;
        return this.context.getApproxParamsToPullPt(previewResult.netPtFromSwap, this.slippage);
    }

    async getMinLpOut() {
        return (await this.preview())?.minLpOut;
    }

    override async gatherDebugInfo(): Promise<AddLiquiditySingleTokenRouteDebugInfo> {
        return {
            type: 'zapIn',
            name: 'AddLiquiditySingleToken',
            tokenMintSy: this.tokenMintSy,
            bulk: await this.getUsedBulk().catch(() => NATIVE_ADDRESS_0x00),
            marketAddress: this.market,
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
            tokenIn: this.tokenIn,
        };
    }
}

export class AddLiquiditySingleTokenRoute<T extends MetaMethodType> extends BaseAddLiquiditySingleTokenRoute<
    T,
    AddLiquiditySingleTokenRoute<T>
> {
    override routeWithBulkSeller(withBulkSeller = true): AddLiquiditySingleTokenRoute<T> {
        return new AddLiquiditySingleTokenRoute(this.market, this.tokenIn, this.netTokenIn, this.slippage, {
            context: this.context,
            tokenMintSy: this.tokenMintSy,
            withBulkSeller,
            cloneFrom: this,
        });
    }
}
