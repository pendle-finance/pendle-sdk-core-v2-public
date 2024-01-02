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

export type RemoveLiquiditySingleTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyOut: BN;
    netSyFromBurn: BN;
    netPtFromBurn: BN;
    netSyFeeFromMarket: BN;
    netSyFeeFromLimit: BN;
    netSyFromSwap: BN;
    priceImpact: offchainMath.FixedX18;
    exchangeRateAfter: offchainMath.MarketExchangeRate;
    limitOrderMatchedResult: limitOrder.LimitOrderMatchedResult;
};

export type RemoveLiquiditySingleTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // cast BigNumber to string for readability
    lpToRemove: string;
    tokenOut: Address;
};

export abstract class _RemoveLiquiditySingleTokenRoute<
    SelfType extends _RemoveLiquiditySingleTokenRoute<SelfType>
> extends BaseZapOutRoute<RemoveLiquiditySingleTokenRouteIntermediateData, SelfType> {
    override readonly routeName = 'RemoveLiquiditySingleToken';
    constructor(
        readonly market: Address | MarketEntity,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<SelfType>
    ) {
        super(params);
    }

    get marketAddress() {
        return this.router.getMarketAddress(this.market);
    }

    override async getSourceTokenAmount() {
        return { token: this.marketAddress, amount: this.lpToRemove };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.marketAddress, amount: this.lpToRemove });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquiditySingleTokenRouteIntermediateData | undefined
    > {
        const marketStaticMath = await this.getMarketStaticMath();

        const removeLiqResult = marketStaticMath.removeLiquidityDualSyAndPtStatic(BN.from(this.lpToRemove).toBigInt());
        let totalSyOut = BN.from(removeLiqResult.netSyOut);
        let netPtRemains = BN.from(removeLiqResult.netPtOut);

        const afterLiqRemovalMarketStaticMath = removeLiqResult.afterMath;
        const limitOrderMatchedResult = await this.router.limitOrderMatcher.swapPtForSy(this.market, netPtRemains, {
            routerMethod: 'removeLiquiditySingleToken',
        });
        totalSyOut = totalSyOut.add(limitOrderMatchedResult.netOutputToTaker);
        netPtRemains = netPtRemains.sub(limitOrderMatchedResult.netInputFromTaker);

        const swapPtToSyResult = afterLiqRemovalMarketStaticMath.swapExactPtForSyStaticAllowExpired(
            netPtRemains.toBigInt()
        );
        totalSyOut = totalSyOut.add(swapPtToSyResult.netSyOut);

        return {
            intermediateSyAmount: totalSyOut,
            netSyOut: BN.from(totalSyOut),
            netSyFromBurn: BN.from(removeLiqResult.netSyOut),
            netPtFromBurn: BN.from(removeLiqResult.netPtOut),
            netSyFeeFromMarket: BN.from(swapPtToSyResult.netSyFee),
            netSyFeeFromLimit: limitOrderMatchedResult.totalFee,
            netSyFromSwap: BN.from(swapPtToSyResult.netSyOut),
            priceImpact: swapPtToSyResult.priceImpact,
            exchangeRateAfter: swapPtToSyResult.exchangeRateAfter,

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
        const res = await this.router.contract.callStatic.removeLiquiditySingleToken(
            signerAddress,
            this.marketAddress,
            this.lpToRemove,
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
        'removeLiquiditySingleToken',
        RemoveLiquiditySingleTokenRouteIntermediateData & {
            route: SelfType;
        }
    > {
        const res = await this.buildGenericCall(
            {
                netTokenOut: (await this.getNetOut())!,
                output: (await this.buildTokenOutput())!,
                kybercallData: (await this.getAggregatorResult())!,
                redeemedFromSyAmount: (await this.getTokenRedeemSyAmount())!,
                intermediateSy: (await this.getIntermediateSyAmount())!,
                route: this as unknown as SelfType,
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
            this.marketAddress,
            this.lpToRemove,
            output,
            intermediateResult.limitOrderMatchedResult.toRawLimitOrderDataStructForChain(this.router.chainId),
            { ...data, ...params, ...intermediateResult }
        );
    }

    override async gatherDebugInfo(): Promise<RemoveLiquiditySingleTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.marketAddress,
            lpToRemove: String(this.lpToRemove),
            tokenOut: this.tokenOut,
        };
    }
}

export class RemoveLiquiditySingleTokenRoute extends _RemoveLiquiditySingleTokenRoute<RemoveLiquiditySingleTokenRoute> {}
