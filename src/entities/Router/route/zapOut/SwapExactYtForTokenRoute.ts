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

export type SwapExactYtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFeeFromMarket: BN;
    netSyFeeFromLimit: BN;
    priceImpact: offchainMath.FixedX18;
    exchangeRateAfter: offchainMath.MarketExchangeRate;
    netSyOut: BN;
    limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
};

export type SwapExactYtForTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // castt
    exactYtIn: string;
    tokenOut: Address;
};

export class SwapExactYtForTokenRoute extends BaseZapOutRoute<
    SwapExactYtForTokenRouteIntermediateData,
    SwapExactYtForTokenRoute
> {
    override readonly routeName = 'SwapExactYtForToken';
    constructor(
        readonly market: MarketEntity,
        readonly exactYtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<SwapExactYtForTokenRoute>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: await this.market.yt(), amount: this.exactYtIn };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const yt = await this.market.yt();
        return this.checkUserApproval(signerAddress, { token: yt, amount: this.exactYtIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactYtForTokenRouteIntermediateData | undefined
    > {
        // TODO combine with SwapExactYtForSy
        let netYtRemains = BN.from(this.exactYtIn);
        let totalSyOut = BN.from(0);
        const [limitOrderMatchedResult, marketStaticMath] = await Promise.all([
            this.router.limitOrderMatcher.swapYtForSy(this.market, netYtRemains, {
                routerMethod: 'swapExactYtForToken',
            }),
            this.getMarketStaticMath(),
        ]);
        netYtRemains = netYtRemains.sub(limitOrderMatchedResult.netInputFromTaker);
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);

        const marketResult = marketStaticMath.swapExactYtForSyStatic(netYtRemains.toBigInt());
        totalSyOut = totalSyOut.add(marketResult.netSyOut);
        // netYtRemains should be zero by now

        return {
            intermediateSyAmount: totalSyOut,
            priceImpact: marketResult.priceImpact,
            exchangeRateAfter: marketResult.exchangeRateAfter,
            netSyOut: totalSyOut,
            netSyFeeFromMarket: BN.from(marketResult.netSyFee),
            netSyFeeFromLimit: BN.from(limitOrderMatchedResult.totalFee),
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
        const res = await this.router.contract.callStatic.swapExactYtForToken(
            signerAddress,
            this.market.address,
            this.exactYtIn,
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
        'swapExactYtForToken',
        SwapExactYtForTokenRouteIntermediateData & {
            route: SwapExactYtForTokenRoute;
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
        return this.router.contract.metaCall.swapExactYtForToken(
            params.receiver,
            this.market.address,
            this.exactYtIn,
            output,
            intermediateResult.limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.router.chainId),
            {
                ...data,
                ...params,
                ...intermediateResult,
            }
        );
    }

    override async gatherDebugInfo(): Promise<SwapExactYtForTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.market.address,
            exactYtIn: String(this.exactYtIn),
            tokenOut: this.tokenOut,
        };
    }
}
