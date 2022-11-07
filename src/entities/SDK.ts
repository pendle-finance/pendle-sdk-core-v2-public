import { RouterStatic, WrappedContract } from '../contracts';
import type { Address, NetworkConnection, ChainId } from '../types';
import type { UserPyInfo } from './YtEntity';
import type { UserMarketInfo } from './MarketEntity';
import { getRouterStatic } from './helper';
import { Multicall } from '../multicall';

export type SDKConfig = NetworkConnection & {
    multicall?: Multicall;
};

export class SDK {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly multicall?: Multicall;

    constructor(readonly chainId: ChainId, config: SDKConfig) {
        this.multicall = config?.multicall;
        this.routerStatic = getRouterStatic(chainId, config);
    }

    /**
     * Get information about the user's PY positions
     * @param user Address of the user
     * @param pys PT and YT token addresses that we want to check
     * @returns UserPYInfo object array representing user's PY positions
     */
    async getUserPYPositionsByPYs(
        user: Address,
        pys: Address[],
        params?: { multicall?: Multicall }
    ): Promise<UserPyInfo[]> {
        return this.routerStatic.multicallStatic.getUserPYPositionsByPYs(user, pys, params);
    }

    async getUserMarketPositions(
        user: Address,
        markets: Address[],
        params?: { multicall?: Multicall }
    ): Promise<UserMarketInfo[]> {
        return this.routerStatic.multicallStatic.getUserMarketPositions(user, markets, params);
    }
}
