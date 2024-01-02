import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, calcSlippedDownAmount, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export type RemoveLiquidityDualTokenAndPtRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netPtOut: BN;
    afterMath: offchainMath.MarketStaticMath;
};

export type RemoveLiquidityDualTokenAndPtRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // cast BigNumber to string for readability
    lpToRemove: string;
    tokenOut: Address;
};

export class RemoveLiquidityDualTokenAndPtRoute extends BaseZapOutRoute<
    RemoveLiquidityDualTokenAndPtRouteIntermediateData,
    RemoveLiquidityDualTokenAndPtRoute
> {
    override readonly routeName = 'RemoveLiquidityDualTokenAndPt';
    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<RemoveLiquidityDualTokenAndPtRoute>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: this.market, amount: this.lpToRemove };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.market, amount: this.lpToRemove });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquidityDualTokenAndPtRouteIntermediateData | undefined
    > {
        const marketStaticMath = await this.getMarketStaticMath();
        const data = marketStaticMath.removeLiquidityDualSyAndPtStatic(BN.from(this.lpToRemove).toBigInt());
        return {
            netPtOut: BN.from(data.netPtOut),
            afterMath: data.afterMath,
            intermediateSyAmount: BN.from(data.netSyOut),
        };
    }

    @NoArgsCache
    override async getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenRedeemSyOutputStruct] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildDummyTokenOutputForTokenRedeemSy(),
        ]);
        if (!signerAddress) return undefined;
        const dummyMinPtOut = 0;
        const res = await this.router.contract.callStatic.removeLiquidityDualTokenAndPt(
            signerAddress,
            this.market,
            this.lpToRemove,
            tokenRedeemSyOutputStruct,
            dummyMinPtOut
        );
        return res.netTokenOut;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'removeLiquidityDualTokenAndPt',
        RemoveLiquidityDualTokenAndPtRouteIntermediateData & {
            route: RemoveLiquidityDualTokenAndPtRoute;
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
