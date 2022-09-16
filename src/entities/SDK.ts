import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import type { UserPyInfo } from './YtEntity';
import type { UserMarketInfo } from './MarketEntity';
import { getRouterStatic } from './helper';
import { Multicall } from '../multicall';

export class SDK {
    protected readonly routerStatic: RouterStatic;

    constructor(protected readonly networkConnection: NetworkConnection, readonly chainId: ChainId) {
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    /**
     * Get information about the user's PY positions
     * @param user Address of the user
     * @param pys PT and YT token addresses that we want to check
     * @returns UserPYInfo object array representing user's PY positions
     */
    async getUserPYPositionsByPYs(user: Address, pys: Address[], multicall?: Multicall): Promise<UserPyInfo[]> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserPYPositionsByPYs(user, pys);
    }

    async getUserMarketPositions(user: Address, markets: Address[], multicall?: Multicall): Promise<UserMarketInfo[]> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserMarketPositions(user, markets);
    }
}
