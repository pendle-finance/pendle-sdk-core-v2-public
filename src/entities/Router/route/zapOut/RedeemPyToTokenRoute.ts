import {
    BaseZapOutRoute,
    BaseZapOutRouteIntermediateData,
    BaseZapOutRouteConfig,
    ZapOutRouteDebugInfo,
} from './BaseZapOutRoute';
import { MetaMethodType } from '../../../../contracts';
import { BN, Address, NoArgsCache } from '../../../../common';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { YtEntity } from '../../../YtEntity';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export type RedeemPyToTokenRouteIntermediateData = BaseZapOutRouteIntermediateData & {
    pyIndex: offchainMath.PyIndex;
};

export type RedeemPyToTokenRouteDebugInfo = ZapOutRouteDebugInfo & {
    yt: Address;
    // cast BigNumber to string for readability
    netPyIn: string;
    tokenOut: Address;
};

export class RedeemPyToTokenRoute extends BaseZapOutRoute<RedeemPyToTokenRouteIntermediateData, RedeemPyToTokenRoute> {
    override readonly routeName = 'RedeemPyToToken';
    readonly ytEntity: YtEntity;
    constructor(
        _yt: Address | YtEntity,
        readonly netPyIn: BN,
        readonly tokenOut: Address,
        readonly slippage: number,
        params: BaseZapOutRouteConfig<RedeemPyToTokenRoute>
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

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const pt = await this.ytEntity.pt();
        const [isExpired, ytApproved, ptApproved] = await Promise.all([
            this.ytEntity.isExpired(this.routerExtraParams),
            this.checkUserApproval(signerAddress, { token: this.ytEntity.address, amount: this.netPyIn }),
            this.checkUserApproval(signerAddress, { token: pt, amount: this.netPyIn }),
        ]);
        if (isExpired) return ptApproved;
        return ytApproved && ptApproved;
    }

    protected override async previewIntermediateSyImpl(): Promise<RedeemPyToTokenRouteIntermediateData | undefined> {
        const pyIndex = await this.ytEntity.pyIndexCurrent(this.routerExtraParams.forCallStatic);
        const intermediateSyAmount = BN.from(pyIndex.convert({ asset: this.netPyIn.toBigInt() }).sy);
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
        return res.netTokenOut;
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        const mm = await this.buildGenericCall({}, this.routerExtraParams);
        return mm?.estimateGas();
    }

    async buildCall(): RouterMetaMethodReturnType<
        'meta-method',
        'redeemPyToToken',
        RedeemPyToTokenRouteIntermediateData & {
            route: RedeemPyToTokenRoute;
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
