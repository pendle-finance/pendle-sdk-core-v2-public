import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import type { UserPyInfo } from './YtEntity';
import type { UserMarketInfo } from './MarketEntity';
import { getRouterStatic } from './helper';
import { Multicall } from '../multicall';
import { WrappedContract } from '../contractHelper';

export type SDKConfig = {
    multicall?: Multicall;
};

export class SDK {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly multicall?: Multicall;

    constructor(
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: SDKConfig
    ) {
        this.multicall = config?.multicall;
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    /**
     * Get information about the user's PY positions
     * @param user Address of the user
     * @param pys PT and YT token addresses that we want to check
     * @returns UserPYInfo object array representing user's PY positions
     */
    async getUserPYPositionsByPYs(user: Address, pys: Address[], multicall = this.multicall): Promise<UserPyInfo[]> {
        return this.routerStatic.multicallStatic.getUserPYPositionsByPYs(user, pys, multicall);
    }

    async getUserMarketPositions(
        user: Address,
        markets: Address[],
        multicall = this.multicall
    ): Promise<UserMarketInfo[]> {
        return this.routerStatic.multicallStatic.getUserMarketPositions(user, markets, multicall);
    }
}
