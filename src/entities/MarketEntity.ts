import type { PendleMarket, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { MarketStateStructOutput } from '@pendle/core-v2/typechain-types/PendleMarket';
import type { IPRouterStatic } from '@pendle/core-v2/typechain-types/IPRouterStatic';
import type { Address, NetworkConnection, TokenAmount } from '../types';
import { abi as PendleMarketABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarket.sol/PendleMarket.json';
import { BigNumber as BN, ContractInterface } from 'ethers';
import { getRouterStatic } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';
import { ChainId } from '../types';
import { ScyEntity } from './ScyEntity';
import { PtEntity } from './PtEntity';

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

export class MarketEntity extends ERC20 {
    protected readonly routerStatic: RouterStatic;
    protected _ptAddress: Address | undefined;
    protected _scyAddress: Address | undefined;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = PendleMarketABI
    ) {
        super(address, networkConnection, chainId, abi);
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
    }

    get pendleMarketContract() {
        return this.contract as PendleMarket;
    }

    get marketContract() {
        return this.pendleMarketContract;
    }

    async getMarketInfo(multicall?: Multicall): Promise<MarketInfo> {
        const res = await Multicall.wrap(this.routerStatic, multicall).callStatic.getMarketInfo(this.address);
        this._ptAddress = res.pt;
        this._scyAddress = res.scy;
        return res;
    }

    async getUserMarketInfo(user: Address, multicall?: Multicall): Promise<UserMarketInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserMarketInfo(this.address, user);
    }

    async SCY(multicall?: Multicall): Promise<Address> {
        return this._scyAddress ?? this.getMarketInfo(multicall).then(({ scy }) => scy);
    }

    /**
     * Alias for Market#SCY
     * @see MarketEntity#SCY
     */
    async scy(multicall?: Multicall) {
        return this.SCY(multicall);
    }

    async PT(multicall?: Multicall): Promise<Address> {
        return this._ptAddress ?? this.getMarketInfo(multicall).then(({ pt }) => pt);
    }

    /**
     * Alias for Market#PT
     * @see MarketEntity#PT
     */
    async pt(multicall?: Multicall) {
        return this.PT(multicall);
    }

    // Consideration: more efficient result caching?
    async scyEntity(multicall?: Multicall) {
        const scyAddr = await this.SCY(multicall);
        return new ScyEntity(scyAddr, this.networkConnection, this.chainId);
    }

    // Consideration: more efficient result caching?
    async ptEntity(multicall?: Multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.networkConnection, this.chainId);
    }

    async getRewardTokens(multicall?: Multicall) {
        return Multicall.wrap(this.marketContract, multicall).callStatic.getRewardTokens();
    }
}
