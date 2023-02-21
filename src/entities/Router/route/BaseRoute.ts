import { RouteContext } from './RouteContext';
import {
    Address,
    BN,
    toAddress,
    NATIVE_ADDRESS_0x00,
    isSameAddress,
    NoArgsCache,
    ethersConstants,
} from '../../../common';
import { MetaMethodType } from '../../../contracts';
import { GasEstimationError } from '../../../errors';

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
            NoArgsCache.copyValue(this, params.cloneFrom, BaseRoute.prototype.getBulkSellerInfo);
            NoArgsCache.copyValue(this, params.cloneFrom, BaseRoute.prototype.getGasUsed);
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
    protected abstract getGasUsedImplement(): Promise<BN | undefined>;
    protected abstract getTokenAmountForBulkTrade(): Promise<{ netTokenIn: BN; netSyIn: BN } | undefined>;

    @NoArgsCache
    async getGasUsed(): Promise<BN> {
        if (!this.router.networkConnection.signer) {
            return ethersConstants.MaxUint256;
        }
        try {
            return (await this.getGasUsedImplement()) ?? ethersConstants.MaxUint256;
        } catch (e: any) {
            if (e instanceof GasEstimationError) {
                return ethersConstants.MaxUint256;
            }
            throw e;
        }
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
        return this.router.kyberHelper;
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
        const { bulk, totalToken, totalSy } = await this.router.routerStatic.multicallStatic[
            'getBulkSellerInfo(address,address,uint256,uint256)'
        ](
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
        return !isSameAddress((await this.getBulkSellerInfo()).bulk, NATIVE_ADDRESS_0x00);
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
}