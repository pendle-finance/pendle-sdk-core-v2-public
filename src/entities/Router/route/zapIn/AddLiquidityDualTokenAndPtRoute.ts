import { BaseZapInRoute, BaseZapInRouteConfig, BaseZapInRouteData, ZapInRouteDebugInfo } from './BaseZapInRoute';
import { RouterMetaMethodReturnType, FixedRouterMetaMethodExtraParams } from '../../types';
import { MetaMethodType, mergeMetaMethodExtraParams } from '../../../../contracts';
import { Address, BigNumberish, BN, calcSlippedDownAmountSqrt } from '../../../../common';
import { MarketEntity } from '../../../MarketEntity';
import { txOverridesValueFromTokenInput } from '../helper';

export type AddLiquidityDualTokenAndPtRouteData = BaseZapInRouteData & {
    netLpOut: BN;
    netPtUsed: BN;
    netSyUsed: BN;
    minLpOut: BN;
};

export type AddLiquidityDualTokenAndPtRouteDebugInfo = ZapInRouteDebugInfo & {
    marketAddress: Address;
    tokenIn: Address;

    // force BigNumber to human readable format
    tokenDesired: string;
    ptDesired: string;

    slippage: number;
};

export class AddLiquidityDualTokenAndPtRoute<T extends MetaMethodType> extends BaseZapInRoute<
    T,
    AddLiquidityDualTokenAndPtRouteData,
    AddLiquidityDualTokenAndPtRoute<T>
> {
    override readonly routeName = 'AddLiquidityDualTokenAndPt';

    constructor(
        readonly market: MarketEntity,
        readonly tokenIn: Address,
        readonly tokenDesired: BigNumberish,
        readonly ptDesired: BigNumberish,
        readonly slippage: number,
        params: BaseZapInRouteConfig<T, AddLiquidityDualTokenAndPtRoute<T>>
    ) {
        super(params);
    }

    override get sourceTokenAmount() {
        return { token: this.tokenIn, amount: this.tokenDesired };
    }

    override routeWithBulkSeller(withBulkSeller = true): AddLiquidityDualTokenAndPtRoute<T> {
        return new AddLiquidityDualTokenAndPtRoute(
            this.market,
            this.tokenIn,
            this.tokenDesired,
            this.ptDesired,
            this.slippage,
            {
                context: this.context,
                tokenMintSy: this.tokenMintSy,
                withBulkSeller,
                cloneFrom: this,
            }
        );
    }

    override async signerHasApprovedImplement(signerAddress: Address): Promise<boolean> {
        const pt = await this.market.PT(); // one more stage?
        const [tokenIsApproved, ptIsApproved] = await Promise.all([
            this.checkUserApproval(signerAddress, this.sourceTokenAmount),
            this.checkUserApproval(signerAddress, { token: pt, amount: this.ptDesired }),
        ]);
        return tokenIsApproved && ptIsApproved;
    }

    override async getNetOut(): Promise<BN | undefined> {
        return (await this.preview())?.netLpOut;
    }

    protected override async previewWithRouterStatic(): Promise<AddLiquidityDualTokenAndPtRouteData | undefined> {
        const [input, mintedSyAmount] = await Promise.all([this.buildTokenInput(), this.getMintedSyAmount()]);
        if (!input || !mintedSyAmount) {
            return undefined;
        }
        const data = await this.routerStaticCall.addLiquidityDualSyAndPtStatic(
            this.market.address,
            mintedSyAmount,
            this.ptDesired,
            this.routerExtraParams.forCallStatic
        );
        const minLpOut = calcSlippedDownAmountSqrt(data.netLpOut, this.slippage);
        return {
            ...data,
            minLpOut,
            intermediateSyAmount: mintedSyAmount,
        };
    }

    override async getGasUsedImplement(): Promise<BN | undefined> {
        return this.buildGenericCall({}, { ...this.routerExtraParams, method: 'estimateGas' });
    }

    async buildCall(): RouterMetaMethodReturnType<
        T,
        'addLiquidityDualTokenAndPt',
        AddLiquidityDualTokenAndPtRouteData & {
            route: AddLiquidityDualTokenAndPtRoute<T>;
        }
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
        const { minLpOut } = previewResult;
        return this.router.contract.metaCall.addLiquidityDualTokenAndPt(
            this.routerExtraParams.receiver,
            this.market.address,
            input,
            this.ptDesired,
            minLpOut,
            { ...data, ...mergeMetaMethodExtraParams({ overrides }, params) }
        );
    }

    override async gatherDebugInfo(): Promise<AddLiquidityDualTokenAndPtRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            marketAddress: this.market.address,
            ptDesired: String(this.ptDesired),
            tokenDesired: String(this.tokenDesired),
            tokenIn: this.tokenIn,
            slippage: this.slippage,
        };
    }
}
