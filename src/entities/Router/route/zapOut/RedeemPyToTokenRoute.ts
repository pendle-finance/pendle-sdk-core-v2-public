import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, PyIndex } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { TokenOutput } from '../../types';
import { KybercallData } from '../../../KyberHelper';
import { YtEntity } from '../../../YtEntity';

export type RedeemPyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    pyIndex: BN;
};

export class RedeemPyToTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RedeemPyToTokenRouteIntermediateData,
    RedeemPyToTokenRoute<T>
> {
    readonly ytEntity: YtEntity;
    constructor(
        _yt: Address | YtEntity,
        readonly netPyIn: BN,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RedeemPyToTokenRoute<T>>
    ) {
        super(params);
        this.ytEntity = typeof _yt === 'string' ? new YtEntity(_yt, this.router.entityConfig) : _yt;
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): RedeemPyToTokenRoute<T> {
        return new RedeemPyToTokenRoute(this.ytEntity, this.netPyIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemPyToTokenRouteIntermediateData | undefined> {
        const pyIndex = await this.ytEntity.pyIndexCurrent(this.routerExtraParams.forCallStatic);
        const intermediateSyAmount = new PyIndex(pyIndex).assetToSy(this.netPyIn);
        return { intermediateSyAmount, pyIndex };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'redeemPyToToken',
        RedeemPyToTokenRouteIntermediateData & {
            route: RedeemPyToTokenRoute<T>;

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
        return this.router.contract.metaCall.redeemPyToToken(
            params.receiver,
            this.ytEntity.address,
            this.netPyIn,
            output,
            { ...data, ...params, ...intermediateResult }
        );
    }
}
