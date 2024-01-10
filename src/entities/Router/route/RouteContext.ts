import { BaseRouter } from '../BaseRouter';
import { BN, Address, toAddress, ethersConstants, NoArgsCache, createNoArgsCache, bnMax } from '../../../common';
import { SyEntity } from '../../SyEntity';
import { FixedRouterMetaMethodExtraParams, ApproxParamsStruct } from '../types';
import { BaseRoute } from './BaseRoute';
import * as iters from 'itertools';

export type RouteContextConfig = {
    readonly router: BaseRouter;
    readonly syEntity: SyEntity;
    readonly routerExtraParams: FixedRouterMetaMethodExtraParams<'meta-method'>;
    readonly aggregatorSlippage: number;
};

export class RouteContext<RouteType extends BaseRoute<any>> {
    readonly router: BaseRouter;
    readonly syEntity: SyEntity;
    readonly routerExtraParams: FixedRouterMetaMethodExtraParams<'meta-method'>;
    readonly aggregatorSlippage: number;
    readonly routes: RouteType[] = [];
    private readonly sharedCacheData = new Map();

    static readonly NoArgsSharedCache = createNoArgsCache<{ context: RouteContext<any> }>(
        (obj, propertyKey) => obj.context.sharedCacheData.has(propertyKey),
        (obj, propertyKey, value) => obj.context.sharedCacheData.set(propertyKey, value),
        (obj, propertyKey) => obj.context.sharedCacheData.get(propertyKey),
        (obj, propertyKey) => obj.context.sharedCacheData.delete(propertyKey)
    );

    constructor(params: RouteContextConfig) {
        ({
            router: this.router,
            syEntity: this.syEntity,
            routerExtraParams: this.routerExtraParams,
            aggregatorSlippage: this.aggregatorSlippage,
        } = params);
    }

    addRoute(route: RouteType) {
        this.routes.push(route);
        route.prefetch();
        /* eslint-disable @typescript-eslint/unbound-method */
        NoArgsCache.invalidate(this, RouteContext.prototype.getMaxOutAmongAllRoutes);
        /* eslint-enable @typescript-eslint/unbound-method */
    }

    removeRoute(route: RouteType): boolean {
        const pos = this.routes.indexOf(route);
        if (pos == -1) return false;
        this.routes.splice(pos, 1);
        return true;
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
            this.routes.map((route) =>
                route.getNetOut().then(
                    (res) => res ?? [],
                    () => []
                )
            )
        ).then((results) => results.flat());
        if (routeOut.length === 0) return undefined;
        return iters.reduce(routeOut, (a, b) => bnMax(a, b));
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
