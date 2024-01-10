import {
    Address,
    BN,
    NoArgsCache,
    calcSlippedDownAmount,
    NATIVE_ADDRESS_0xEE,
    NATIVE_ADDRESS_0x00,
    bnSafeDiv,
} from '../../../../common';
import { TokenOutput } from '../../types';
import { BaseRoute, BaseRouteConfig, RouteDebugInfo } from '../BaseRoute';
import { RouteContext } from '../RouteContext';
import { EMPTY_SWAP_DATA } from '../../aggregatorHelper';

export type BaseZapOutRouteConfig<SelfType extends BaseZapOutRoute<BaseZapOutRouteIntermediateData, SelfType>> =
    BaseRouteConfig<SelfType> & {
        readonly tokenRedeemSy: Address;
    };

export type ZapOutRouteDebugInfo = RouteDebugInfo & {
    type: 'zapOut';
    tokenRedeemSy: Address;
    slippage: number;
};

export type BaseZapOutRouteIntermediateData = {
    intermediateSyAmount: BN;
};

export abstract class BaseZapOutRoute<
    IntermediateSyData extends BaseZapOutRouteIntermediateData,
    SelfType extends BaseZapOutRoute<IntermediateSyData, SelfType>,
> extends BaseRoute<SelfType> {
    readonly tokenRedeemSy: Address;
    abstract readonly targetToken: Address;
    abstract readonly slippage: number;

    constructor(params: BaseZapOutRouteConfig<SelfType>) {
        super(params);
        ({ tokenRedeemSy: this.tokenRedeemSy } = params);
        const other = params.cloneFrom;
        if (other != undefined) {
            /* eslint-disable @typescript-eslint/unbound-method */
            NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.buildTokenOutput);
            NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.getTokenRedeemSyAmount);
            NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.getTokenRedeemSyAmountWithRouter);
            NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.getTokenRedeemSyViaSyPreviewRedeem);
            /* eslint-enable @typescript-eslint/unbound-method */
        }
    }

    /* eslint-disable @typescript-eslint/unbound-method */
    protected override addSelfToContext() {
        super.addSelfToContext();
        RouteContext.NoArgsSharedCache.invalidate(this, BaseZapOutRoute.prototype.estimateMaxOutAmongAllRouteInEth);
    }
    /* eslint-enable @typescript-eslint/unbound-method */

    protected abstract previewIntermediateSyImpl(): Promise<IntermediateSyData | undefined>;

    override async getNetOut(): Promise<BN | undefined> {
        const aggregatorResult = await this.getAggregatorResult();
        if (!aggregatorResult) {
            return undefined;
        }
        return BN.from(aggregatorResult.outputAmount);
    }

    override async estimateNetOutInEth(): Promise<BN | undefined> {
        const [curNetOut, maxNetOut, maxNetOutInEth] = await Promise.all([
            this.getNetOut(),
            this.context.getMaxOutAmongAllRoutes(),
            this.estimateMaxOutAmongAllRouteInEth(),
        ]);

        if (
            curNetOut == undefined ||
            maxNetOut == undefined ||
            maxNetOutInEth == undefined ||
            maxNetOutInEth.isZero()
        ) {
            return undefined;
        }

        // the result will be
        //      curNetOut * theoreticalPrice
        //
        // where `theoreticalPrice` is
        //      maxNetOutInEth / maxNetOut
        return bnSafeDiv(curNetOut.mul(maxNetOutInEth), maxNetOut);
    }

    /**
     * Estimate the max out amount among all routes in term of ETH.
     *
     * @remarks
     * If the token is not swappable to ETH, this function will return `0`.
     */
    @RouteContext.NoArgsSharedCache
    async estimateMaxOutAmongAllRouteInEth(): Promise<BN | undefined> {
        const maxOut = await this.context.getMaxOutAmongAllRoutes();
        const targetToken = this.targetToken;
        if (maxOut == undefined) return undefined;
        const DUMMY_SLIPPAGE = 0.2 / 100;
        try {
            const { outputAmount } = await this.router.aggregatorHelper.makeCall(
                { token: targetToken, amount: maxOut },
                NATIVE_ADDRESS_0xEE,
                DUMMY_SLIPPAGE
            );
            return outputAmount;
        } catch {
            return BN.from(0);
        }
    }

    @RouteContext.NoArgsSharedCache
    previewIntermediateSy(): Promise<IntermediateSyData | undefined> {
        return this.previewIntermediateSyImpl();
    }

    async getIntermediateSyAmount(): Promise<BN | undefined> {
        return (await this.previewIntermediateSy())?.intermediateSyAmount;
    }

    /**
     * @return
     * - {@link ethersConstants.Zero} if result if {@link this.previewIntermediateSy} is `undefined`.
     * - redeemed amount from {@link syEntity} with amount from {@link previewIntermediateSy} otherwise.
     */
    @NoArgsCache
    async getTokenRedeemSyAmount(): Promise<BN | undefined> {
        return this.getTokenRedeemSyAmountWithRouter().then(
            (value) => value ?? this.getTokenRedeemSyViaSyPreviewRedeem()
        );
    }

    abstract getTokenRedeemSyAmountWithRouter(): Promise<BN | undefined>;

    @NoArgsCache
    async getTokenRedeemSyViaSyPreviewRedeem(): Promise<BN | undefined> {
        const [syToRedeemAmount] = await Promise.all([this.getIntermediateSyAmount()]);
        if (!syToRedeemAmount) return undefined;
        return this.syEntity.previewRedeem(this.tokenRedeemSy, syToRedeemAmount);
    }

    getNeedScale() {
        return true;
    }

    @NoArgsCache
    async getAggregatorResult() {
        const tokenRedeemSyAmount = await this.getTokenRedeemSyAmount();
        if (tokenRedeemSyAmount === undefined) {
            return undefined;
        }
        return this.aggregatorHelper.makeCall(
            { token: this.tokenRedeemSy, amount: tokenRedeemSyAmount },
            this.targetToken,
            this.context.aggregatorSlippage,
            { aggregatorReceiver: this.routerExtraParams.aggregatorReceiver, needScale: this.getNeedScale() }
        );
    }

    @NoArgsCache
    async buildTokenOutput(): Promise<TokenOutput | undefined> {
        const [aggregatorResult] = await Promise.all([this.getAggregatorResult()]);
        if (aggregatorResult === undefined) {
            return undefined;
        }
        const swapData = aggregatorResult.createSwapData({ needScale: this.getNeedScale() });
        const pendleSwap = this.router.getPendleSwapAddress(swapData.swapType);
        const output: TokenOutput = {
            tokenOut: this.targetToken,
            minTokenOut: calcSlippedDownAmount((await this.getNetOut())!, this.slippage),
            tokenRedeemSy: this.tokenRedeemSy,
            pendleSwap,
            swapData,
        };
        return output;
    }

    /**
     * Helper function. Create tokenOutput for {@link BaseZapOutRoute#getTokenRedeemSyAmountWithRouter}.
     * Mainly used in subclass, where the method is implemented.
     */
    @NoArgsCache
    async buildDummyTokenOutputForTokenRedeemSy(): Promise<TokenOutput> {
        return {
            tokenOut: this.tokenRedeemSy,
            tokenRedeemSy: this.tokenRedeemSy,
            minTokenOut: 0, // No slippage control here, we are simply doing simulation.
            pendleSwap: NATIVE_ADDRESS_0x00,
            swapData: EMPTY_SWAP_DATA,
        };
    }

    override async gatherDebugInfo(): Promise<ZapOutRouteDebugInfo> {
        return {
            ...(await super.gatherDebugInfo()),
            type: 'zapOut',
            tokenRedeemSy: this.tokenRedeemSy,
            slippage: this.slippage,
        };
    }
}
