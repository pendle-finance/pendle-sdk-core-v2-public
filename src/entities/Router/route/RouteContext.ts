import { BaseRouter } from '../BaseRouter';
import { BN, Address, toAddress, ethersConstants, NoArgsCache, createNoArgsCache, bnMax } from '../../../common';
import { createERC20 } from '../../erc20';
import { SyEntity } from '../../SyEntity';
import { FixedRouterMetaMethodExtraParams, ApproxParamsStruct } from '../types';
import { MetaMethodType } from '../../../contracts';
import { BaseRoute } from './BaseRoute';

export type RouteContextConfig<T extends MetaMethodType> = {
    readonly router: BaseRouter;
    readonly syEntity: SyEntity;
    readonly routerExtraParams: FixedRouterMetaMethodExtraParams<T>;
    readonly aggregatorSlippage: number;
    readonly bulkBuffer: number;
};

export class RouteContext<T extends MetaMethodType, RouteType extends BaseRoute<T, any>> {
    readonly router: BaseRouter;
    readonly syEntity: SyEntity;
    readonly routerExtraParams: FixedRouterMetaMethodExtraParams<T>;
    readonly aggregatorSlippage: number;
    readonly bulkBuffer: number;
    readonly routes: RouteType[] = [];
    private readonly sharedCacheData = new Map();

    static readonly NoArgsSharedCache = createNoArgsCache<{ context: RouteContext<any, any> }>(
        (obj, propertyKey) => obj.context.sharedCacheData.has(propertyKey),
        (obj, propertyKey, value) => obj.context.sharedCacheData.set(propertyKey, value),
        (obj, propertyKey) => obj.context.sharedCacheData.get(propertyKey),
        (obj, propertyKey) => obj.context.sharedCacheData.delete(propertyKey)
    );

    constructor(params: RouteContextConfig<T>) {
        ({
            router: this.router,
            syEntity: this.syEntity,
            routerExtraParams: this.routerExtraParams,
            aggregatorSlippage: this.aggregatorSlippage,
            bulkBuffer: this.bulkBuffer,
        } = params);
    }

    addRoute(route: RouteType) {
        this.routes.push(route);
        NoArgsCache.invalidate(this, RouteContext.prototype.getMaxOutAmongAllRoutes);
    }

    // TODO cache
    // This function is **unused** for now.
    async getAllowance(userAddress: Address, token: Address): Promise<BN> {
        return createERC20(token, this.router.entityConfig).allowance(userAddress, this.router.address);
    }

    @NoArgsCache
    async getTokensMintSy(): Promise<Address[]> {
        return this.syEntity.getTokensIn(this.routerExtraParams);
    }

    @NoArgsCache
    async getTokensRedeemSy(): Promise<Address[]> {
        return this.syEntity.getTokensOut(this.routerExtraParams);
    }

    @NoArgsCache
    async getSignerAddress(): Promise<Address | undefined> {
        if (!this.router.networkConnection.signer) {
            return undefined;
        }
        return toAddress(await this.router.networkConnection.signer.getAddress());
    }

    @NoArgsCache
    async getMaxOutAmongAllRoutes(): Promise<BN | undefined> {
        const routeOut = await Promise.all(
            this.routes.map(async (route) => {
                if (route.withBulkSeller) return [];
                const result = await route.getNetOut();
                return result != undefined ? [result] : [];
            })
        ).then((results) => results.flat());
        if (routeOut.length === 0) return undefined;
        return routeOut.reduce(bnMax);
    }

    guessOutApproxParams(this: void, guessAmountOut: BN, slippage: number): ApproxParamsStruct {
        return BaseRouter.guessInApproxParams(guessAmountOut, slippage);
    }

    guessInApproxParams(this: void, guessAmountIn: BN, slippage: number): ApproxParamsStruct {
        return BaseRouter.guessOutApproxParams(guessAmountIn, slippage);
    }

    /**
     *
     * @see [Corresponding contract method](https://github.com/pendle-finance/pendle-core-v2/blob/a34601353a666986093a25f74930df043b0205ce/contracts/offchain-helpers/MarketMathStatic.sol#L17)
     */
    getDefaultApproxParams(): ApproxParamsStruct {
        return {
            guessMin: 0,
            guessMax: ethersConstants.MaxUint256,
            guessOffchain: 0,
            maxIteration: 256,
            eps: BN.from(10).pow(14),
        };
    }
}
