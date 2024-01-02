import { RouteContext } from './RouteContext';
import {
    Address,
    BN,
    NoArgsCache,
    ethersConstants,
    RawTokenAmount,
    BigNumberish,
    assertDefined,
} from '../../../common';
import * as common from '../../../common';
import { GasEstimationError } from '../../../errors';
import { createERC20 } from '../../erc20';
import { MarketEntity } from '../../MarketEntity';
import * as offchainMath from '@pendle/core-v2-offchain-math';

export type BaseRouteConfig<SelfType extends BaseRoute<SelfType>> = {
    readonly context: RouteContext<SelfType>;
    readonly cloneFrom?: BaseRoute<SelfType>;
};

export type RouteDebugInfo = {
    name: string;
};

/**
 * @typeParam SelfType is for specifying the return type of the method that
 * clone this object. Used for inheritance.
 *
 * @privateRemarks
 *
 * Route object is only used for routing, and the data is _intermedate_,
 * that is, it should be freshly fetched when a {@link Router} method
 * is called. So some method of Router are marked with the {@link NoArgsCache}
 * decorator -- they will be executed at most once. When invoked two ore
 * more time, the cached result is returned. In otherword, we have **lazy**
 * execution! This give us some advantages:
 *
 * - Better logic sharing. All the neccesary info are shared, but without
 *   precomputing.
 * - Easier extension. Such function does not need to have additional
 *   parameters. They can just use the existing method inside this class.
 *   Need more params? Create another function!
 */
export abstract class BaseRoute<SelfType extends BaseRoute<SelfType>> {
    readonly context: RouteContext<SelfType>;

    constructor(params: BaseRouteConfig<SelfType>) {
        ({ context: this.context } = params);
        if (params.cloneFrom != undefined) {
            /* eslint-disable @typescript-eslint/unbound-method */
            NoArgsCache.copyValue(this, params.cloneFrom, BaseRoute.prototype.getGasUsedUnwrapped);
            /* eslint-enable @typescript-eslint/unbound-method */
        }
        this.addSelfToContext();
    }

    /**
     * Will be called when this route is added to the routeContext.
     * That is, will be invoked when {@link RouteContext#addRoute} is called with `this`.
     * @remarks
     * Should not failed.
     * For promises, remember to add catch.
     */
    prefetch() {
        if (this.hasMarket()) {
            void this.getMarketStaticMath().catch(() => {});
        }
    }

    protected addSelfToContext() {
        // Not sure if there is a better way not to cast this
        this.context.addRoute(this as unknown as SelfType);
    }

    /**
     * Remove this route from context
     */
    remove(): boolean {
        return this.context.removeRoute(this as unknown as SelfType);
    }

    abstract readonly routeName: string;
    abstract getSourceTokenAmount(): Promise<RawTokenAmount<BigNumberish>>;

    abstract getNetOut(): Promise<BN | undefined>;
    abstract estimateNetOutInEth(): Promise<BN | undefined>;
    abstract getGasUsedImplement(): Promise<BN | undefined>;
    abstract signerHasApprovedImplement(signerAddress: Address): Promise<boolean>;

    @RouteContext.NoArgsSharedCache
    async getSignerAddressIfApproved(): Promise<Address | undefined> {
        const signerAddress = await this.context.getSignerAddress();
        if (!!signerAddress && (await this.signerHasApprovedImplement(signerAddress))) return signerAddress;
    }

    async signerHasApproved(): Promise<boolean> {
        const signerAddressOrUndefined = await this.getSignerAddressIfApproved();
        return !!signerAddressOrUndefined;
    }

    /**
     * Estimate gas used for the route.
     * @remarks
     * This method will call {@link BaseRoute#getGasUsedUnwrapped}. If gas estimation can not be done
     * (that is, when {@link BaseRoute#getGasUsedUnwrapped} returns `undefined`, or {@link GasEstimationError}
     * is thrown), {@link ethersConstants.MaxUint256} will be returned, so the
     * routing algorithm can still work correctly.
     *
     * @return
     *  - {@link ethersConstants.MaxUint256} if gas estimation can not be done.
     *  - The estimated gas used will be returned otherwise.
     */
    async getGasUsed(): Promise<BN> {
        try {
            return (await this.getGasUsedUnwrapped()) ?? ethersConstants.MaxUint256;
        } catch (e: unknown) {
            if (e instanceof GasEstimationError) {
                return ethersConstants.MaxUint256;
            }
            throw e;
        }
    }

    /**
     * Estimate gas used for the route.
     * @remarks
     * Unlike {@link BaseRoute#getGasUsed}, this method does not handle the case where the
     * gas estimation can not be done. Useful to get more infomation of the gas estimation process
     * (such as getting the error).
     */
    @NoArgsCache
    async getGasUsedUnwrapped(): Promise<BN | undefined> {
        if (!(await this.signerHasApproved())) {
            return undefined;
        }
        return this.getGasUsedImplement();
    }

    get router() {
        return this.context.router;
    }

    get syEntity() {
        return this.context.syEntity;
    }

    get routerExtraParams() {
        return this.context.routerExtraParams;
    }

    get aggregatorHelper() {
        return this.router.aggregatorHelper;
    }

    async estimateActualReceivedInEth(): Promise<BN | undefined> {
        const [netOutInEth, gasUsed, gasFee] = await Promise.all([
            this.estimateNetOutInEth(),
            this.getGasUsed(),
            this.router.gasFeeEstimator.getGasFee(),
        ]);

        if (netOutInEth == undefined) return undefined;
        return netOutInEth.sub(gasUsed.mul(gasFee));
    }

    protected getSpenderAddress(): Address {
        return this.router.address;
    }

    protected async checkUserApproval(
        userAddress: Address,
        { token, amount }: RawTokenAmount<BigNumberish>
    ): Promise<boolean> {
        const erc20 = createERC20(token, this.router.entityConfig);
        const spenderAddress = this.getSpenderAddress();
        const [userBalance, spenderAllowance] = await Promise.all([
            erc20.balanceOf(userAddress),
            erc20.allowance(userAddress, spenderAddress),
        ]);
        return spenderAllowance.gte(amount) && userBalance.gte(amount);
    }

    async gatherDebugInfo(): Promise<RouteDebugInfo> {
        return {
            name: this.routeName,
        };
    }

    // Optional typed helpers.
    // The helper must have the corresponding required fields from `this` before used.
    // Otherwise tsc will complain (and it should to avoid misuse of these functions).

    getMarketAddress(this: BaseRoute<SelfType> & { market: Address | MarketEntity }) {
        return this.router.getMarketAddress(this.market);
    }

    getMarketStaticMath(
        this: BaseRoute<SelfType> & { market: Address | MarketEntity }
    ): Promise<offchainMath.MarketStaticMath>;
    @RouteContext.NoArgsSharedCache
    async getMarketStaticMath(
        this: BaseRoute<SelfType> & { market?: Address | MarketEntity | undefined }
    ): Promise<offchainMath.MarketStaticMath> {
        return this.router.getMarketStaticMathWithParams(assertDefined(this.market), this.routerExtraParams);
    }

    protected hasMarket(): this is BaseRoute<SelfType> & { market: Address | MarketEntity } {
        return 'market' in this && (common.isAddress(this.market) || this.market instanceof MarketEntity);
    }
}
