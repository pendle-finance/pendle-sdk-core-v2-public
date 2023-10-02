import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, PyIndex, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { YtEntity } from '../../../YtEntity';

export type RedeemPyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    pyIndex: BN;
};

export type RedeemPyToTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    yt: Address;
    // cast BigNumber to string for readability
    netPyIn: string;
    tokenOut: Address;
};

export class RedeemPyToTokenRoute<T extends MetaMethodType> extends BaseZapOutRoute<
    T,
    RedeemPyToTokenRouteIntermediateData,
    RedeemPyToTokenRoute<T>
> {
    override readonly routeName = 'RedeemPyToToken';
    readonly ytEntity: YtEntity;
    constructor(
        _yt: Address | YtEntity,
        readonly netPyIn: BN,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<T, RedeemPyToTokenRoute<T>>
    ) {
        super(params);
        this.ytEntity = typeof _yt === 'string' ? new YtEntity(_yt, this.router.entityConfig) : _yt;
    }

    override async getSourceTokenAmount() {
        return { token: this.ytEntity.address, amount: this.netPyIn };
    }

    override get targetToken() {
        return this.tokenOut;
    }

    override routeWithBulkSeller(withBulkSeller = true): RedeemPyToTokenRoute<T> {
        return new RedeemPyToTokenRoute(this.ytEntity, this.netPyIn, this.tokenOut, this.slippage, {
            context: this.context,
            tokenRedeemSy: this.tokenRedeemSy,
            withBulkSeller,
        });
    }

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const pt = await this.ytEntity.pt();
        const [ytApproved, ptApproved] = await Promise.all([
            this.checkUserApproval(signerAddress, { token: this.ytEntity.address, amount: this.netPyIn }),
            this.checkUserApproval(signerAddress, { token: pt, amount: this.netPyIn }),
        ]);
        return ytApproved && ptApproved;
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemPyToTokenRouteIntermediateData | undefined> {
        const pyIndex = await this.ytEntity.pyIndexCurrent(this.routerExtraParams.forCallStatic);
        const intermediateSyAmount = new PyIndex(pyIndex).assetToSy(this.netPyIn);
        return { intermediateSyAmount, pyIndex };
    }

    @NoArgsCache
    override async getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined> {
        const [signerAddress, tokenRedeemSyOutputStruct] = await Promise.all([
            this.getSignerAddressIfApproved(),
            this.buildDummyTokenOutputForTokenRedeemSy(),
        ]);
        if (!signerAddress) return undefined;
        const res = await this.router.contract.callStatic.redeemPyToToken(
            signerAddress,
            this.ytEntity.address,
            this.netPyIn,
            tokenRedeemSyOutputStruct
        );
        return res;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'redeemPyToToken',
        RedeemPyToTokenRouteIntermediateData & {
            route: RedeemPyToTokenRoute<T>;
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
        return this.router.contract.metaCall.redeemPyToToken(
            params.receiver,
            this.ytEntity.address,
            this.netPyIn,
            output,
            { ...data, ...params, ...intermediateResult }
        );
    }

    override async gatherDebugInfo(): Promise<RedeemPyToTokenRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            yt: this.ytEntity.address,
            netPyIn: String(this.netPyIn),
            tokenOut: this.tokenOut,
        };
    }
}
