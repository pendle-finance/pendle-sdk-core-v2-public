import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type RemoveLiquiditySingleTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
};

export class RemoveLiquiditySingleTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RemoveLiquiditySingleTokenRouteIntermediateData,
    RemoveLiquiditySingleTokenRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RemoveLiquiditySingleTokenRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): RemoveLiquiditySingleTokenRoute<T> {
        return new RemoveLiquiditySingleTokenRoute(this.market, this.lpToRemove, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquiditySingleTokenRouteIntermediateData | undefined
    > {
        const {
            netSyOut: intermediateSyAmount,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
        } = await this.routerStaticCall.removeLiquiditySingleSyStatic(
            this.market,
            this.lpToRemove,
            this.routerExtraParams.forCallStatic
        );
        return { intermediateSyAmount, netSyFee, priceImpact, exchangeRateAfter };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleToken',
        RemoveLiquiditySingleTokenRouteIntermediateData & {
            route: RemoveLiquiditySingleTokenRoute<T>;
        }
    > {
        const res = await this.buildGenericCall(
            {
                netTokenOut: (await this.getNetOut())!,
                output: (await this.buildTokenOutput())!,
                kybercallData: (await this.getAggregatorResult())!,
                redeemedFromSyAmount: (await this.getTokenRedeemSyAmount())!,
                intermediateSy: (await this.getIntermediateSyAmount())!,
                route: this,
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
        return this.router.contract.metaCall.removeLiquiditySingleToken(
            params.receiver,
            this.market,
            this.lpToRemove,
            output,
            { ...data, ...params, ...intermediateResult }
        );
    }
}
