import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, calcSlippedDownAmount, NATIVE_ADDRESS_0x00 } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type RemoveLiquidityDualTokenAndPtRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netPtOut: BN;
    netTokenOut: BN;
    netSyToRedeem: BN;
};

export type RemoveLiquidityDualTokenAndPtRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // cast BigNumber to string for readability
    lpToRemove: string;
    tokenOut: Address;
};

export class RemoveLiquidityDualTokenAndPtRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RemoveLiquidityDualTokenAndPtRouteIntermediateData,
    RemoveLiquidityDualTokenAndPtRoute<T>
> {
    override readonly routeName = 'RemoveLiquidityDualTokenAndPt';
    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RemoveLiquidityDualTokenAndPtRoute<T>>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: this.market, amount: this.lpToRemove };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller = true): RemoveLiquidityDualTokenAndPtRoute<T> {
        return new RemoveLiquidityDualTokenAndPtRoute(this.market, this.lpToRemove, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.market, amount: this.lpToRemove });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquidityDualTokenAndPtRouteIntermediateData | undefined
    > {
        const data = await this.routerStaticCall.removeLiquidityDualTokenAndPtStatic(
            this.market,
            this.lpToRemove,
            this.tokenRedeemSy,
            NATIVE_ADDRESS_0x00,
            this.routerExtraParams.forCallStatic
        );
        return { ...data, intermediateSyAmount: data.netSyToRedeem };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'removeLiquidityDualTokenAndPt',
        RemoveLiquidityDualTokenAndPtRouteIntermediateData & {
            route: RemoveLiquidityDualTokenAndPtRoute<T>;
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

    override async gatherDebugInfo(): Promise<RemoveLiquidityDualTokenAndPtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.market,
            lpToRemove: String(this.lpToRemove),
            tokenOut: this.tokenOut,
        };
    }
}
