import type { PendleMarket, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { MarketStateStruct } from '@pendle/core-v2/typechain-types/PendleMarket';
import type { IPRouterStatic } from '@pendle/core-v2/typechain-types/IPRouterStatic';
import type { Address, NetworkConnection, TokenAmount } from './types';
import { abi as PendleMarketABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarket.sol/PendleMarket.json';
import { type BigNumber as BN, Contract } from 'ethers';
import { getRouterStatic } from './helper';

export type MarketInfo = {
    pt: Address;
    scy: Address;
    state: MarketStateStruct;
    impliedYield: BN;
};

export type UserMarketInfo = {
    market: Address;
    lpBalance: BN;
    ptBalance: TokenAmount;
    scyBalance: TokenAmount;
    assetBalance: IPRouterStatic.AssetAmountStruct;
};

export class Market {
    readonly contract: PendleMarket;

    protected routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.contract = new Contract(address, PendleMarketABI, networkConnection.provider) as PendleMarket;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async getMarketInfo(): Promise<MarketInfo> {
        return this.routerStatic.callStatic.getMarketInfo(this.address);
    }

    async getUserMarketInfo(user: Address): Promise<UserMarketInfo> {
        return this.routerStatic.callStatic.getUserMarketInfo(this.address, user);
    }
}
