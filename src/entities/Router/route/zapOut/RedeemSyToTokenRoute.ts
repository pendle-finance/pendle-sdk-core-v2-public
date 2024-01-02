import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';

export type RedeemSyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData;

export type RedeemSyToTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    sy: Address;
    // cast BigNumber to string for readability
    netSyIn: string;
    tokenOut: Address;
};

export class RedeemSyToTokenRoute extends BaseZapOutRoute<RedeemSyToTokenRouteIntermediateData, RedeemSyToTokenRoute> {
    override readonly routeName = 'RedeemSyToToken';

    constructor(
        readonly sy: Address,
        readonly netSyIn: BN,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<RedeemSyToTokenRoute>
    ) {
        super(params);
    }

    override async getSourceTokenAmount() {
        return { token: this.sy, amount: this.netSyIn };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        return this.checkUserApproval(signerAddress, { token: this.sy, amount: this.netSyIn });
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemSyToTokenRouteIntermediateData | undefined> {
        return Promise.resolve({ intermediateSyAmount: this.netSyIn });
    }

    @NoArgsCache
    override async getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenRedeemSyOutputStruct] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildDummyTokenOutputForTokenRedeemSy(),
        ]);
        if (!signerAddress) return undefined;
        const res = await this.router.contract.callStatic.redeemSyToToken(
            signerAddress,
            this.sy,
            this.netSyIn,
            tokenRedeemSyOutputStruct
        );
        return res;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'redeemSyToToken',
        RedeemSyToTokenRouteIntermediateData & {
            route: RedeemSyToTokenRoute;
        }
    > {
        const res = await this.buildGenericCall(
            {
                netTokenOut: (await this.getNetOut())!,
                output: (await this.buildTokenOutput())!,
                kybercallData: (await this.getAggregatorResult())!,
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
        return this.router.contract.metaCall.redeemSyToToken(params.receiver, this.sy, this.netSyIn, output, {
            ...data,
            ...params,
            ...intermediateResult,
        });
    }

    override async gatherDebugInfo(): Promise<RedeemSyToTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            sy: this.sy,
            netSyIn: String(this.netSyIn),
            tokenOut: this.tokenOut,
        };
    }
}
