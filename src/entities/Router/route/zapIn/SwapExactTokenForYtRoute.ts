import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmount } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';
import { MarketEntity } from '../../../MarketEntity';
import * as limitOrder from '../../limitOrder';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export type SwapExactTokenForYtRouteData = BaseZapInRouteData & {
    netYtOut: BN;
    netSyMinted: BN;
    netSyFeeFromMarket: BN;
    netSyFeeFromLimit: BN;
    priceImpact: offchainMath.FixedX18;
    exchangeRateAfter: offchainMath.MarketExchangeRate;
    minYtOut: BN;
};

export type SwapExactTokenForYtRouteDebugInfo = ZapInRouteDebugInfo & {
    market: Address;
    tokenIn: Address;
    // cast BigNumber to string for readability
    netTokenIn: string;
    slippage: number;
};

export class SwapExactTokenForYtRoute extends BaseZapInRoute<SwapExactTokenForYtRouteData, SwapExactTokenForYtRoute> {
    override readonly routeName = 'SwapExactTokenForYt';

    constructor(
        readonly market: Address | MarketEntity,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<SwapExactTokenForYtRoute>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netYtOut;
    }

    protected override async previewWithRouterStatic(): Promise<SwapExactTokenForYtRouteData | undefined> {
        const [input, mintedSyAmount, marketStaticMath] = await Promise.all([
            this.buildTokenInput(),
            this.getMintedSyAmount(),
            this.getMarketStaticMath(),
        ]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }

        const data = marketStaticMath.swapExactSyForYtStatic(mintedSyAmount.toBigInt());
        const minYtOut = calcSlippedDownAmount(data.netYtOut, this.slippage);
        return {
            intermediateSyAmount: mintedSyAmount,
            netSyMinted: mintedSyAmount,
            netYtOut: BN.from(data.netYtOut),
            netSyFeeFromMarket: BN.from(data.netSyFee),
            netSyFeeFromLimit: BN.from(0),
            priceImpact: data.priceImpact,
            exchangeRateAfter: data.exchangeRateAfter,
            minYtOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'swapExactTokenForYt',
        SwapExactTokenForYtRouteData & { route: SwapExactTokenForYtRoute }
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall({ ...previewResult, route: this }, this.routerExtraParams);
        return res!;
    }

    /**
     * @privateRemarks
     * This method does not have a specified return type. This is **intended**,
     * as typescript version < 5 still has _bug_ in their type checker (for
     * example {@link https://github.com/microsoft/TypeScript/issues/52096}).
     *
     * The type binder somehow still work fine, so for now we can let tsc do
     * the typing for us.
     */
    protected async buildGenericCall<Data extends object, MT extends MetaMethodType>(
        data: Data,
        params: FixedRouterMetaMethodExtraParams<MT>
    ) {
        const [input, previewResult] = await Promise.all([this.buildTokenInput(), this.preview()]);
        if (!input || !previewResult) return undefined;
        const overrides = txOverridesValueFromTokenInput(input);
        const { minYtOut } = previewResult;
        const approxParam = this.context.getApproxParamsToPullPt(previewResult.netYtOut, this.slippage);

        return this.router.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            this.getMarketAddress(),
            minYtOut,
            approxParam,
            input,
            limitOrder.LimitOrderMatchedResult.EMPTY.toRawLimitOrderDataStructForChain(this.router.chainId),
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }

    override async gatherDebugInfo(): Promise<SwapExactTokenForYtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.getMarketAddress(),
            tokenIn: this.tokenIn,
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
        };
    }
}
