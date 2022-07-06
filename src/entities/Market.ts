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
    address: Address;
    contract: PendleMarket;
    chainId: number;

    protected networkConnection: NetworkConnection;
    protected routerStatic: RouterStatic;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, PendleMarketABI, _networkConnection.provider) as PendleMarket;
        this.routerStatic = getRouterStatic(_networkConnection.provider, _chainId);
    }

    async getMarketInfo(): Promise<MarketInfo> {
        return this.routerStatic.callStatic.getMarketInfo(this.address);
    }

    async getUserMarketInfo(user: Address): Promise<UserMarketInfo> {
        return this.routerStatic.callStatic.getUserMarketInfo(this.address, user);
    }
}
