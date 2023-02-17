import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { TokenOutput } from '../../types';
import { KybercallData } from '../../../KyberHelper';

export type SwapExactPtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
};

export class SwapExactPtForTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    SwapExactPtForTokenRouteIntermediateData,
    SwapExactPtForTokenRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly exactPtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, SwapExactPtForTokenRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): SwapExactPtForTokenRoute<T> {
        return new SwapExactPtForTokenRoute(this.market, this.exactPtIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactPtForTokenRouteIntermediateData | undefined
    > {
        const {
            netSyOut: intermediateSyAmount,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
        } = await this.routerStaticCall.swapExactPtForSyStatic(
            this.market,
            this.exactPtIn,
            this.routerExtraParams.forCallStatic
        );
        return { intermediateSyAmount, netSyFee, priceImpact, exchangeRateAfter };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'swapExactPtForToken',
        SwapExactPtForTokenRouteIntermediateData & {
            route: SwapExactPtForTokenRoute<T>;

            /** @deprecated use Route API instead */
            netTokenOut: BN;
            /** @deprecated use Route API instead */
            output: TokenOutput;
            /** @deprecated use Route API instead */
            kybercallData: KybercallData;
            /** @deprecated use intermediateSyAmount or Route API instead */
            intermediateSy: BN;
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
        return this.router.contract.metaCall.swapExactPtForToken(params.receiver, this.market, this.exactPtIn, output, {
            ...data,
            ...params,
            ...intermediateResult,
        });
    }
}
