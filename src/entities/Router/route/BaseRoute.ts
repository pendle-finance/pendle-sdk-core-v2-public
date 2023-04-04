import { RouteContext } from './RouteContext';
import {
    Address,
    BN,
    toAddress,
    NATIVE_ADDRESS_0x00,
    areSameAddresses,
    NoArgsCache,
    ethersConstants,
    RawTokenAmount,
    BigNumberish,
} from '../../../common';
import { MetaMethodType } from '../../../contracts';
import { GasEstimationError } from '../../../errors';
import { createERC20 } from '../../erc20';

export type BaseRouteConfig<T extends MetaMethodType, SelfType extends BaseRoute<T, any>> = {
    readonly context: RouteContext<T, SelfType>;
    readonly withBulkSeller?: boolean;
    readonly cloneFrom?: BaseRoute<T, SelfType>;
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
export abstract class BaseRoute<T extends MetaMethodType, SelfType extends BaseRoute<T, SelfType>> {
    readonly context: RouteContext<T, SelfType>;
    readonly withBulkSeller: boolean;

    constructor(params: BaseRouteConfig<T, SelfType>) {
        ({ context: this.context, withBulkSeller: this.withBulkSeller = false } = params);
        if (params.cloneFrom != undefined) {
            /* eslint-disable @typescript-eslint/unbound-method */
            NoArgsCache.copyValue(this, params.cloneFrom, BaseRoute.prototype.getBulkSellerInfo);
            NoArgsCache.copyValue(this, params.cloneFrom, BaseRoute.prototype.getGasUsedUnwrapped);
            /* eslint-enable @typescript-eslint/unbound-method */
        }
        this.addSelfToContext();
    }

    protected addSelfToContext() {
        // Not sure if there is a better way not to cast this
        this.context.addRoute(this as unknown as SelfType);
    }

    abstract get tokenBulk(): Address;

    /**
     * _Clone_ the current object but set {@link withBulkSeller} to `true`.
     * @privateRemarks
     * Can we have a better name for this function
     */
    abstract routeWithBulkSeller(withBulkSeller?: boolean): SelfType;
    abstract getNetOut(): Promise<BN | undefined>;
    abstract estimateNetOutInEth(): Promise<BN | undefined>;
    abstract getGasUsedImplement(): Promise<BN | undefined>;
    abstract getTokenAmountForBulkTrade(): Promise<{ netTokenIn: BN; netSyIn: BN } | undefined>;
    abstract signerHasApprovedImplement(signerAddress: Address): Promise<boolean>;

    @RouteContext.NoArgsSharedCache
    async signerHasApproved(): Promise<boolean> {
        const signerAddress = await this.context.getSignerAddress();
        return !!signerAddress && this.signerHasApprovedImplement(signerAddress);
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
        } catch (e: any) {
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

    get routerStatic() {
        return this.router.routerStatic;
    }

    protected get routerStaticCall() {
        return this.routerStatic.multicallStatic;
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

    @NoArgsCache
    async getBulkSellerInfo(): Promise<{
        bulk: Address;
        totalToken: BN;
        totalSy: BN;
    }> {
        const tokenAmountForBulkTrade = await this.getTokenAmountForBulkTrade();
        if (tokenAmountForBulkTrade === undefined) {
            return { bulk: NATIVE_ADDRESS_0x00, totalToken: ethersConstants.Zero, totalSy: ethersConstants.Zero };
        }
        const { bulk, totalToken, totalSy } = await this.router.routerStatic.multicallStatic.getBulkSellerInfo(
            this.tokenBulk,
            this.syEntity.address,
            tokenAmountForBulkTrade.netTokenIn,
            tokenAmountForBulkTrade.netSyIn,
            this.routerExtraParams
        );
        return {
            bulk: toAddress(bulk),
            totalToken,
            totalSy,
        };
    }

    async hasBulkSeller(): Promise<boolean> {
        return !areSameAddresses((await this.getBulkSellerInfo()).bulk, NATIVE_ADDRESS_0x00);
    }

    async getUsedBulk(): Promise<Address> {
        if (!this.withBulkSeller) {
            return NATIVE_ADDRESS_0x00;
        }
        const { bulk } = await this.getBulkSellerInfo();
        return bulk;
    }

    async estimateActualReceivedInEth(): Promise<BN | undefined> {
        const [netOutInEth, gasUsed, gasFee] = await Promise.all([
            this.estimateNetOutInEth(),
            this.getGasUsed(),
            this.router.gasFeeEstimator.getGasFee(),
        ]);

        if (netOutInEth == undefined || gasUsed == undefined) return undefined;
        return netOutInEth.sub(gasUsed.mul(gasFee));
    }

    protected async checkUserApproval(
        userAddress: Address,
        { token, amount }: RawTokenAmount<BigNumberish>
    ): Promise<boolean> {
        const allowance = await createERC20(token, this.router.entityConfig).allowance(
            userAddress,
            this.router.address
        );
        return allowance.gte(amount);
    }
}
