import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmountSqrt } from '../../../../common';
import { txOverridesValueFromTokenInput } from '../helper';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as limitOrder from '../../limitOrder';
import { MarketEntity } from '../../../MarketEntity';

export type AddLiquiditySingleTokenRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netPtFromSwap: BN;
    netSyFeeFromMarket: BN;
    netSyFeeFromLimit: BN;
    netSyMinted: BN;
    netSyToSwap: BN;
    priceImpact: offchainMath.FixedX18;
    exchangeRateAfter: offchainMath.MarketExchangeRate;
    minLpOut: BN;
};

export type AddLiquiditySingleTokenRouteConfig<SelfType extends BaseAddLiquiditySingleTokenRoute<SelfType>> =
    BaseZapInRouteConfig<SelfType>;

export type AddLiquiditySingleTokenRouteDebugInfo = ZapInRouteDebugInfo & {
    marketAddress: Address;
    tokenIn: Address;

    // force BigNumber to string for readability
    netTokenIn: string;

    slippage: number;
};

export abstract class BaseAddLiquiditySingleTokenRoute<
    SelfType extends BaseAddLiquiditySingleTokenRoute<SelfType>,
> extends BaseZapInRoute<AddLiquiditySingleTokenRouteData, SelfType> {
    override readonly routeName = 'AddLiquiditySingleToken';
    constructor(
        readonly market: Address | MarketEntity,
        readonly tokenIn: Address,
        readonly netTokenIn: BigNumberish,
        readonly slippage: number,
        params: AddLiquiditySingleTokenRouteConfig<SelfType>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.netTokenIn };
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquiditySingleTokenRouteData | undefined> {
        const [input, mintedSyAmount, marketStaticMath] = await Promise.all([
            this.buildTokenInput(),
            this.getMintedSyAmount(),
            this.getMarketStaticMath(),
        ]);
        if (!input || !mintedSyAmount) return undefined;

        const data = marketStaticMath.addLiquiditySingleSyStatic(mintedSyAmount.toBigInt());
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        return {
            intermediateSyAmount: mintedSyAmount,

            netLpOut: BN.from(data.netLpOut),
            netPtFromSwap: BN.from(data.netPtFromSwap),
            netSyFeeFromMarket: BN.from(data.netSyFee),
            netSyFeeFromLimit: BN.from(0),
            priceImpact: data.priceImpact,
            exchangeRateAfter: data.exchangeRateAfter,
            netSyMinted: mintedSyAmount,
            netSyToSwap: BN.from(data.netSyToSwap),
            minLpOut,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, { ...this.routerExtraParams });
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'addLiquiditySingleToken',
        AddLiquiditySingleTokenRouteData & {
            route: SelfType;
        }
    > {
        const previewResult = (await this.preview())!;
        const res = await this.buildGenericCall(
            { ...previewResult, route: this as unknown as SelfType },
            this.routerExtraParams
        );
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
        const [previewResult, approxParams, input] = await Promise.all([
            this.preview(),
            this.getApproxParam(),
            this.buildTokenInput(),
        ]);
        if (!previewResult || !approxParams || !input) return undefined;
        const overrides = txOverridesValueFromTokenInput(input);
        const { minLpOut } = previewResult;
        const res = await this.router.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            this.getMarketAddress(),
            minLpOut,
            approxParams,
            input,
            // we don't handle limit order here
            limitOrder.LimitOrderMatchedResult.EMPTY.toRawLimitOrderDataStructForChain(this.router.chainId),
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
        return res;
    }

    async getApproxParam() {
        const previewResult = await this.preview();
        if (!previewResult) return undefined;
        // This part is legacy. To be removed.
        return this.router.approxParamsGenerator.generate(this.router, {
            routerMethod: 'addLiquiditySingleToken',
            approxSearchingRange: {
                guessMin: 0n,
                guessMax: (1n << 256n) - 1n,
            },
            guessOffchain: previewResult.netPtFromSwap,
            slippage: this.slippage,
            limitOrderMatchedResult: undefined,
        });
    }

    async getMinLpOut() {
        return (await this.preview())?.minLpOut;
    }

    override async gatherDebugInfo(): Promise<AddLiquiditySingleTokenRouteDebugInfo> {
        return {
            type: 'zapIn',
            name: 'AddLiquiditySingleToken',
            tokenMintSy: this.tokenMintSy,
            marketAddress: this.getMarketAddress(),
            netTokenIn: String(this.netTokenIn),
            slippage: this.slippage,
            tokenIn: this.tokenIn,
        };
    }
}

export class AddLiquiditySingleTokenRoute extends BaseAddLiquiditySingleTokenRoute<AddLiquiditySingleTokenRoute> {}
