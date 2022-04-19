import type { RouterStatic } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserYOInfo } from './YT';
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
     * Get information about the user's YO positions
     * @param user Address of the user
     * @param tokens YT, OT, and LP token addresses that we want to check
     * @returns UserYOInfo object array representing user's YO positions
     */
    async getUserYOPositionsByTokens(user: Address, tokens: Address[]): Promise<UserYOInfo[]> {
        return this.routerStatic.callStatic.getUserYOPositionsByTokens(user, tokens);
    }

    async getUserMarketPositions(user: Address, markets: Address[]): Promise<UserMarketInfo[]> {
        return this.routerStatic.callStatic.getUserMarketPositions(user, markets);
    }
}
