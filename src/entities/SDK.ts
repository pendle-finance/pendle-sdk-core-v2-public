import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserPYInfo } from './YT';
import type { UserMarketInfo } from './Market';
import { getRouterStatic } from './helper';

export class SDK {
    public chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    public constructor(_networkConnection: NetworkConnection, _chainId: number) {
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.routerStatic = getRouterStatic(_networkConnection.provider, _chainId);
    }

    /**
     * Get information about the user's PY positions
     * @param user Address of the user
     * @param pys PT and YT token addresses that we want to check
     * @returns UserPYInfo object array representing user's PY positions
     */
    async getUserPYPositionsByPYs(user: Address, pys: Address[]): Promise<UserPYInfo[]> {
        return this.routerStatic.callStatic.getUserPYPositionsByPYs(user, pys);
    }

    async getUserMarketPositions(user: Address, markets: Address[]): Promise<UserMarketInfo[]> {
        return this.routerStatic.callStatic.getUserMarketPositions(user, markets);
    }
}
