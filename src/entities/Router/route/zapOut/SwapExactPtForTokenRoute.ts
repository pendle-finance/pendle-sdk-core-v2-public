import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MarketEntity } from '../../../MarketEntity';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as limitOrder from '../../limitOrder';

export type SwapExactPtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFeeFromMarket: BN;
    netSyFeeFromLimit: BN;
    priceImpact: offchainMath.FixedX18;
    exchangeRateAfter: offchainMath.MarketExchangeRate;
    limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
};

export type SwapExactPtForTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    exactPtIn: string;
    tokenOut: Address;
};

export class SwapExactPtForTokenRoute extends BaseZapOutRoute<
    SwapExactPtForTokenRouteIntermediateData,
    SwapExactPtForTokenRoute
> {
    override readonly routeName = 'SwapExactPtForToken';
    constructor(
        readonly market: MarketEntity,
        readonly exactPtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<SwapExactPtForTokenRoute>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: await this.market.pt(), amount: this.exactPtIn };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const pt = await this.market.pt();
        return this.checkUserApproval(signerAddress, { token: pt, amount: this.exactPtIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactPtForTokenRouteIntermediateData | undefined
    > {
        // TODO combine with swapExactPtForSy
        let totalSyOut = BN.from(0);
        let netPtRemains = BN.from(this.exactPtIn);

        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.router.limitOrderMatcher.swapPtForSy(this.getMarketAddress(), netPtRemains, {
                routerMethod: 'swapExactPtForToken',
            }),
            this.getMarketStaticMath(),
        ]);
        netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactPtForSyStatic(netPtRemains.toBigInt());
        totalSyOut = totalSyOut.add(marketResult.netSyOut);
        // netPtRemains should be zero by now

        return {
            intermediateSyAmount: totalSyOut,
            netSyFeeFromMarket: BN.from(marketResult.netSyFee),
            netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
            priceImpact: marketResult.priceImpact,
            exchangeRateAfter: marketResult.exchangeRateAfter,
            limitOrderMatchedResult,
        };
    }

    @NoArgsCache
    override async getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenRedeemSyOutputStruct, intermediateResult] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildDummyTokenOutputForTokenRedeemSy(),
            this.previewIntermediateSy(),
        ]);
        if (!signerAddress || !intermediateResult) return undefined;
        const res = await this.router.contract.callStatic.swapExactPtForToken(
            signerAddress,
            this.market.address,
            this.exactPtIn,
            tokenRedeemSyOutputStruct,
            intermediateResult.limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.router.chainId)
        );
        return res.netTokenOut;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'swapExactPtForToken',
        SwapExactPtForTokenRouteIntermediateData & {
            route: SwapExactPtForTokenRoute;
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
        return this.router.contract.metaCall.swapExactPtForToken(
            params.receiver,
            this.market.address,
            this.exactPtIn,
            output,
            intermediateResult.limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.router.chainId),
            {
                ...data,
                ...params,
                ...intermediateResult,
            }
        );
    }

    override async gatherDebugInfo(): Promise<SwapExactPtForTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.market.address,
            exactPtIn: String(this.exactPtIn),
            tokenOut: this.tokenOut,
        };
    }
}
