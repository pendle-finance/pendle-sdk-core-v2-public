import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type SwapExactYtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
};

export class SwapExactYtForTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    SwapExactYtForTokenRouteIntermediateData,
    SwapExactYtForTokenRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly exactYtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, SwapExactYtForTokenRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): SwapExactYtForTokenRoute<T> {
        return new SwapExactYtForTokenRoute(this.market, this.exactYtIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactYtForTokenRouteIntermediateData | undefined
    > {
        const {
            netSyOut: intermediateSyAmount,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
        } = await this.routerStaticCall.swapExactYtForSyStatic(
            this.market,
            this.exactYtIn,
            this.routerExtraParams.forCallStatic
        );
        return { intermediateSyAmount, netSyFee, priceImpact, exchangeRateAfter };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'swapExactYtForToken',
        SwapExactYtForTokenRouteIntermediateData & {
            route: SwapExactYtForTokenRoute<T>;
        }
    > {
        const res = await this.buildGenericCall(
            {
                netTokenOut: (await this.getNetOut())!,
                output: (await this.buildTokenOutput())!,
                kybercallData: (await this.getAggregatorResult())!,
                route: this,
                intermediateSy: (await this.getIntermediateSyAmount())!,
            },
            this.routerExtraParams
        );
        return res!;
    }

    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [output, intermediateResult] = await Promise.all([this.buildTokenOutput(), this.previewIntermediateSy()]);
        if (!output || !intermediateResult) return;
        return this.router.contract.metaCall.swapExactYtForToken(params.receiver, this.market, this.exactYtIn, output, {
            ...data,
            ...params,
            ...intermediateResult,
        });
    }
}
