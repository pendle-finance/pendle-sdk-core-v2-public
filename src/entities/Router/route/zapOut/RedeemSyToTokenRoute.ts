import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { TokenOutput } from '../../types';
import { KybercallData } from '../../../KyberHelper';

export type RedeemSyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData;

export class RedeemSyToTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RedeemSyToTokenRouteIntermediateData,
    RedeemSyToTokenRoute<T>
> {
    constructor(
        readonly sy: Address,
        readonly netSyIn: BN,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RedeemSyToTokenRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): RedeemSyToTokenRoute<T> {
        return new RedeemSyToTokenRoute(this.sy, this.netSyIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemSyToTokenRouteIntermediateData | undefined> {
        return { intermediateSyAmount: this.netSyIn };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'redeemSyToToken',
        RedeemSyToTokenRouteIntermediateData & {
            route: RedeemSyToTokenRoute<T>;

            /** @deprecated use Route API instead */
            netTokenOut: BN;
            /** @deprecated use Route API instead */
            output: TokenOutput;
            /** @deprecated use Route API instead */
            kybercallData: KybercallData;
        }
    > {
        const res = await this.buildGenericCall(
            {
                netTokenOut: (await this.getNetOut())!,
                output: (await this.buildTokenOutput())!,
                kybercallData: (await this.getAggregatorResult())!,
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
        return this.router.contract.metaCall.redeemSyToToken(params.receiver, this.sy, this.netSyIn, output, {
            ...data,
            ...params,
            ...intermediateResult,
        });
    }
}
