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

export type SwapExactYtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
    netSyOut: BN;
    netSyOwedInt: BN;
    netPYToRepaySyOwedInt: BN;
    netPYToRedeemSyOutInt: BN;
};

export type SwapExactYtForTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // castt
    exactYtIn: string;
    tokenOut: Address;
};

export class SwapExactYtForTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    SwapExactYtForTokenRouteIntermediateData,
    SwapExactYtForTokenRoute<T>
> {
    override readonly routeName = 'SwapExactYtForToken';
    constructor(
        readonly market: MarketEntity,
        readonly exactYtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, SwapExactYtForTokenRoute<T>>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: await this.market.yt(), amount: this.exactYtIn };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller = true): SwapExactYtForTokenRoute<T> {
        return new SwapExactYtForTokenRoute(this.market, this.exactYtIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const yt = await this.market.yt();
        return this.checkUserApproval(signerAddress, { token: yt, amount: this.exactYtIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactYtForTokenRouteIntermediateData | undefined
    > {
        const data = await this.routerStaticCall.swapExactYtForSyStatic(
            this.market.address,
            this.exactYtIn,
            this.routerExtraParams.forCallStatic
        );
        return { ...data, intermediateSyAmount: data.netSyOut };
    }

    @NoArgsCache
    override async getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenRedeemSyOutputStruct] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildDummyTokenOutputForTokenRedeemSy(),
        ]);
        if (!signerAddress) return undefined;
        const res = await this.router.contract.callStatic.swapExactYtForToken(
            signerAddress,
            this.market.address,
            this.exactYtIn,
            tokenRedeemSyOutputStruct
        );
        return res.netTokenOut;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'swapExactYtForToken',
        SwapExactYtForTokenRouteIntermediateData & {
            route: SwapExactYtForTokenRoute<T>;
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
