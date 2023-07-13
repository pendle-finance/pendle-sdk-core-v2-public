import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type RedeemSyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData;

export type RedeemSyToTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    sy: Address;
    // cast BigNumber to string for readability
    netSyIn: string;
    tokenOut: Address;
};

export class RedeemSyToTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RedeemSyToTokenRouteIntermediateData,
    RedeemSyToTokenRoute<T>
> {
    override readonly routeName = 'RedeemSyToToken';

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

    override routeWithBulkSeller(withBulkSeller = true): RedeemSyToTokenRoute<T> {
        return new RedeemSyToTokenRoute(this.sy, this.netSyIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.sy, amount: this.netSyIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemSyToTokenRouteIntermediateData | undefined> {
        return Promise.resolve({ intermediateSyAmount: this.netSyIn });
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'redeemSyToToken',
        RedeemSyToTokenRouteIntermediateData & {
            route: RedeemSyToTokenRoute<T>;
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

    override async gatherDebugInfo(): Promise<RedeemSyToTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            sy: this.sy,
            netSyIn: String(this.netSyIn),
            tokenOut: this.tokenOut,
        };
    }
}
