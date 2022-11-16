import { RouterStatic, WrappedContract, MulticallStaticParams, getRouterStatic } from '../contracts';
import type { Address, NetworkConnection, ChainId } from '../common';
import type { UserPyInfo } from './PyEntity';
import type { UserMarketInfo } from './MarketEntity';
import { Multicall } from '../multicall';
import { MarketEntity } from './MarketEntity';
import { PyEntity } from './PyEntity';

export type SDKConfig = NetworkConnection & {
    chainId: ChainId;
    multicall?: Multicall;
};

export class SDK {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly multicall?: Multicall;
    readonly chainId: ChainId;

    constructor(config: SDKConfig) {
        this.chainId = config.chainId;
        this.multicall = config?.multicall;
        this.routerStatic = getRouterStatic(config);
    }

    /**
     * Get information about the user's PY positions
     * @param user Address of the user
     * @param pys PT and YT token addresses that we want to check
     * @param params - the additional parameters for read method.
     * @returns UserPYInfo object array representing user's PY positions
     */
    async getUserPYPositionsByPYs(
        user: Address,
        pys: Address[],
        params?: MulticallStaticParams
    ): Promise<UserPyInfo[]> {
        const result = await this.routerStatic.multicallStatic.getUserPYPositionsByPYs(user, pys, params);
        return result.map(PyEntity.toUserPyInfo);
    }

    /**
     * Get user market information from multiple markets.
     * @param user - the user Address
     * @param markets - the list of addresses of markets.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getUserMarketPositions(
        user: Address,
        markets: Address[],
        params?: MulticallStaticParams
    ): Promise<UserMarketInfo[]> {
        const results = await this.routerStatic.multicallStatic.getUserMarketPositions(user, markets, params);
        return results.map(MarketEntity.toUserMarketInfo);
    }
}
