import { BaseZapOutRoute, BaseZapOutRouteIntermediateData, BaseZapOutRouteConfig } from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, NATIVE_ADDRESS_0x00 } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MarketEntity } from '../../../MarketEntity';

export type SwapExactPtForTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
};

export class SwapExactPtForTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    SwapExactPtForTokenRouteIntermediateData,
    SwapExactPtForTokenRoute<T>
> {
    constructor(
        readonly market: MarketEntity,
        readonly exactPtIn: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, SwapExactPtForTokenRoute<T>>
    ) {
        super(params);
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller: boolean = true): SwapExactPtForTokenRoute<T> {
        return new SwapExactPtForTokenRoute(this.market, this.exactPtIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    protected override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const pt = await this.market.pt();
        return this.checkUserApproval(signerAddress, { token: pt, amount: this.exactPtIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        SwapExactPtForTokenRouteIntermediateData | undefined
    > {
        const {
            netSyToRedeem: intermediateSyAmount,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
        } = await this.routerStaticCall.swapExactPtForTokenStatic(
            this.market.address,
            this.exactPtIn,
            this.tokenRedeemSy,
            NATIVE_ADDRESS_0x00,
            this.routerExtraParams.forCallStatic
        );
        return { intermediateSyAmount, netSyFee, priceImpact, exchangeRateAfter };
    }

    protected override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'swapExactPtForToken',
        SwapExactPtForTokenRouteIntermediateData & {
            route: SwapExactPtForTokenRoute<T>;
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
            {
                ...data,
                ...params,
                ...intermediateResult,
            }
        );
    }
}
