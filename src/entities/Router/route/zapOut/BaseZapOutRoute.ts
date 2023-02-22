import {
    Address,
    BN,
    ethersConstants,
    NoArgsCache,
    calcSlippedDownAmount,
    calcSlippedUpAmount,
    NATIVE_ADDRESS_0xEE,
    bnSafeDiv,
} from '../../../../common';
import { MetaMethodType } from '../../../../contracts';
import { TokenOutput } from '../../types';
import { BaseRoute, BaseRouteConfig } from '../BaseRoute';
import { RouteContext } from '../RouteContext';

export type BaseZapOutRouteConfig<
    T extends MetaMethodType,
    SelfType extends BaseZapOutRoute<T, any, SelfType>
> = BaseRouteConfig<T, SelfType> & {
    readonly tokenRedeemSy: Address;
};

export type BaseZapOutRouteIntermediateData = {
    intermediateSyAmount: BN;
};

export abstract class BaseZapOutRoute<
    T extends MetaMethodType,
    IntermediateSyData extends BaseZapOutRouteIntermediateData,
    SelfType extends BaseZapOutRoute<T, IntermediateSyData, SelfType>
> extends BaseRoute<T, SelfType> {
    readonly tokenRedeemSy: Address;
    abstract readonly targetToken: Address;
    abstract readonly slippage: number;

    constructor(params: BaseZapOutRouteConfig<T, SelfType>) {
        super(params);
        ({ tokenRedeemSy: this.tokenRedeemSy } = params);
        const other = params.cloneFrom;
        if (other != undefined) {
            if (other.withBulkSeller === this.withBulkSeller) {
                NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.getTokenRedeemSyAmount);
                NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.getTokenRedeemSyAmount);
                NoArgsCache.copyValue(this, other, BaseZapOutRoute.prototype.buildTokenOutput);
            }
        }
    }

    protected override addSelfToContext() {
        super.addSelfToContext();
        RouteContext.NoArgsSharedCache.invalidate(this, BaseZapOutRoute.prototype.estimateMaxOutAmoungAllRouteInEth);
    }

    protected abstract previewIntermediateSyImpl(): Promise<IntermediateSyData | undefined>;

    protected override async getTokenAmountForBulkTrade(): Promise<{ netTokenIn: BN; netSyIn: BN } | undefined> {
        const previewData = await this.previewIntermediateSy();
        if (previewData == undefined) {
            return undefined;
        }
        return {
            netTokenIn: BN.from(0),
            netSyIn: calcSlippedUpAmount(BN.from(previewData.intermediateSyAmount), this.context.bulkBuffer),
        };
    }

    override get tokenBulk(): Address {
        return this.tokenRedeemSy;
    }

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
            this.estimateMaxOutAmoungAllRouteInEth(),
        ]);

        if (curNetOut == undefined || maxNetOut == undefined || maxNetOutInEth == undefined) {
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
    async estimateMaxOutAmoungAllRouteInEth(): Promise<BN | undefined> {
        const maxOut = await this.context.getMaxOutAmongAllRoutes();
        const targetToken = this.targetToken;
        if (maxOut == undefined || targetToken === undefined) return undefined;
        const DUMMY_SLIPPAGE = 0.2 / 100;
        const aggregatorResult = await this.router.aggregatorHelper.makeCall(
            { token: targetToken, amount: maxOut },
            NATIVE_ADDRESS_0xEE,
            DUMMY_SLIPPAGE
        );
        return aggregatorResult == undefined ? BN.from(0) : BN.from(aggregatorResult.outputAmount);
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
     *
     * {@link ethersConstants.Zero} is returned instead of `undefined` to have less
     * code dealing with type assertion.
     */
    @NoArgsCache
    async getTokenRedeemSyAmount(): Promise<BN> {
        const [intermediateSyAmount, bulk] = await Promise.all([this.getIntermediateSyAmount(), this.getUsedBulk()]);
        if (intermediateSyAmount === undefined) return ethersConstants.Zero;
        return this.syEntity.previewRedeem(this.tokenRedeemSy, intermediateSyAmount, {
            bulk,
        });
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
            { aggregatorReceiver: this.routerExtraParams.aggregatorReceiver }
        );
    }

    @NoArgsCache
    async buildTokenOutput(): Promise<TokenOutput | undefined> {
        const [aggregatorResult, bulk] = await Promise.all([this.getAggregatorResult(), this.getUsedBulk()]);
        if (aggregatorResult === undefined) {
            return undefined;
        }
        const pendleSwap = this.router.getPendleSwapAddress();
        const output: TokenOutput = {
            tokenOut: this.targetToken,
            minTokenOut: calcSlippedDownAmount((await this.getNetOut())!, this.slippage),
            tokenRedeemSy: this.tokenRedeemSy,
            bulk,
            pendleSwap,
            swapData: aggregatorResult.createSwapData({ needScale: true }),
        };
        return output;
    }
}
