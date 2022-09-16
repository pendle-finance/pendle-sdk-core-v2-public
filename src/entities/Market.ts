import type { PendleMarket, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { MarketStateStructOutput } from '@pendle/core-v2/typechain-types/PendleMarket';
import type { IPRouterStatic } from '@pendle/core-v2/typechain-types/IPRouterStatic';
import type { Address, NetworkConnection, TokenAmount } from '../types';
import { abi as PendleMarketABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarket.sol/PendleMarket.json';
import { BigNumber as BN, Contract } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';
import { ChainId } from '../types';

export type MarketInfo = {
    pt: Address;
    scy: Address;
    state: MarketStateStructOutput;
    impliedYield: BN;
    exchangeRate: BN;
};

export type UserMarketInfo = {
    market: Address;
    lpBalance: BN;
    ptBalance: TokenAmount;
    scyBalance: TokenAmount;
    assetBalance: IPRouterStatic.AssetAmountStructOutput;
};

export class Market {
    readonly ERC20: ERC20;
    readonly contract: PendleMarket;

    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this.contract = new Contract(address, PendleMarketABI, networkConnection.provider) as PendleMarket;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    async getMarketInfo(multicall?: Multicall): Promise<MarketInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getMarketInfo(this.address);
    }

    async getUserMarketInfo(user: Address, multicall?: Multicall): Promise<UserMarketInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserMarketInfo(this.address, user);
    }
}
