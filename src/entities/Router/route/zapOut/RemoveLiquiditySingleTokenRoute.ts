import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, BigNumberish, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type RemoveLiquiditySingleTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    netSyFee: BN;
    priceImpact: BN;
    exchangeRateAfter: BN;
    netSyOut: BN;
    netSyFromBurn: BN;
    netPtFromBurn: BN;
    netSyFromSwap: BN;
};

export type RemoveLiquiditySingleTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    market: Address;
    // cast BigNumber to string for readability
    lpToRemove: string;
    tokenOut: Address;
};

export abstract class _RemoveLiquiditySingleTokenRoute<
    T extends MetaMethodType,
    SelfType extends _RemoveLiquiditySingleTokenRoute<T, SelfType>
> extends BaseZapOutRoute<T, RemoveLiquiditySingleTokenRouteIntermediateData, SelfType> {
    override readonly routeName = 'RemoveLiquiditySingleToken';
    constructor(
        readonly market: Address,
        readonly lpToRemove: BigNumberish,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, SelfType>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: this.market, amount: this.lpToRemove };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    abstract routeWithBulkSeller(withBulkSeller?: boolean): SelfType;

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.market, amount: this.lpToRemove });
    }

    protected override async previewIntermediateSyImpl(): Promise<
        RemoveLiquiditySingleTokenRouteIntermediateData | undefined
    > {
        const data = await this.routerStaticCall.removeLiquiditySingleSyStatic(
            this.market,
            this.lpToRemove,
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
        const res = await this.router.contract.callStatic.removeLiquiditySingleToken(
            signerAddress,
            this.market,
            this.lpToRemove,
            tokenRedeemSyOutputStruct
        );
        return res.netTokenOut;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
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
            this.market,
            this.lpToRemove,
            output,
            { ...data, ...params, ...intermediateResult }
        );
    }

    override async gatherDebugInfo(): Promise<RemoveLiquiditySingleTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            market: this.market,
            lpToRemove: String(this.lpToRemove),
            tokenOut: this.tokenOut,
        };
    }
}

export class RemoveLiquiditySingleTokenRoute<T extends MetaMethodType> extends _RemoveLiquiditySingleTokenRoute<
    T,
    RemoveLiquiditySingleTokenRoute<T>
> {
    override routeWithBulkSeller(withBulkSeller = true): RemoveLiquiditySingleTokenRoute<T> {
        return new RemoveLiquiditySingleTokenRoute(this.market, this.lpToRemove, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }
}
