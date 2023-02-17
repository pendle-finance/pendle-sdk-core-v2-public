import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, calcSlippedDownAmount } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { TokenOutput } from '../../types';
import { KybercallData } from '../../../KyberHelper';

export type RemoveLiquidityDualTokenAndPtRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netPtOut: BN;
};

export class RemoveLiquidityDualTokenAndPtRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RemoveLiquidityDualTokenAndPtRouteIntermediateData,
    RemoveLiquidityDualTokenAndPtRoute<T>
> {
    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RemoveLiquidityDualTokenAndPtRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): RemoveLiquidityDualTokenAndPtRoute<T> {
        return new RemoveLiquidityDualTokenAndPtRoute(this.market, this.lpToRemove, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquidityDualTokenAndPtRouteIntermediateData | undefined
    > {
        const { netSyOut: intermediateSyAmount, netPtOut } =
            await this.routerStaticCall.removeLiquidityDualSyAndPtStatic(
                this.market,
                this.lpToRemove,
                this.routerExtraParams.forCallStatic
            );
        return { intermediateSyAmount, netPtOut };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'removeLiquidityDualTokenAndPt',
        RemoveLiquidityDualTokenAndPtRouteIntermediateData & {
            route: RemoveLiquidityDualTokenAndPtRoute<T>;

            /** @deprecated use Route API instead */
            netTokenOut: BN;
            /** @deprecated use Route API instead */
            output: TokenOutput;
            /** @deprecated use Route API instead */
            kybercallData: KybercallData;
            /** @deprecated use Route API instead */
            redeemedFromSyAmount: BN;
            /** @deprecated use intermediateSyAmount or Route API instead */
            intermediateSy: BN;
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
        return this.router.contract.metaCall.removeLiquidityDualTokenAndPt(
            params.receiver,
            this.market,
            this.lpToRemove,
            output,
            calcSlippedDownAmount(intermediateResult.netPtOut, this.slippage),
            { ...data, ...params, ...intermediateResult }
        );
    }
}
