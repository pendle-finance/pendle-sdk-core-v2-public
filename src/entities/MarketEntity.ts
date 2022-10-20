import type { PendleMarket, RouterStatic } from '@pendle/core-v2/typechain-types';
import type { MarketStateStructOutput } from '@pendle/core-v2/typechain-types/PendleMarket';
import type { IPRouterStatic } from '@pendle/core-v2/typechain-types/IPRouterStatic';
import type { Address, NetworkConnection, RawTokenAmount } from '../types';
import { abi as PendleMarketABI } from '@pendle/core-v2/build/artifacts/contracts/core/Market/PendleMarket.sol/PendleMarket.json';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, zip } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { ChainId } from '../types';
import { SyEntity } from './SyEntity';
import { PtEntity } from './PtEntity';
import { WrappedContract, MetaMethodType } from '../contractHelper';

export type MarketInfo = {
    pt: Address;
    sy: Address;
    state: MarketStateStructOutput;
    impliedYield: BN;
    exchangeRate: BN;
};

export type UserMarketInfo = {
    market: Address;
    lpBalance: BN;
    ptBalance: RawTokenAmount;
    syBalance: RawTokenAmount;
    assetBalance: IPRouterStatic.AssetAmountStructOutput;
};

export type MarketEntityConfig = ERC20Config;

export class MarketEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    protected _ptAddress: Address | undefined;
    protected _syAddress: Address | undefined;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: MarketEntityConfig
    ) {
        super(address, networkConnection, chainId, { abi: PendleMarketABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    get pendleMarketContract() {
        return this.contract as WrappedContract<PendleMarket>;
    }

    get marketContract() {
        return this.pendleMarketContract;
    }

    async getMarketInfo(multicall = this.multicall): Promise<MarketInfo> {
        const res = await this.routerStatic.multicallStatic.getMarketInfo(this.address, multicall);
        this._ptAddress = res.pt;
        this._syAddress = res.sy;
        return res;
    }

    async getUserMarketInfo(user: Address, multicall = this.multicall): Promise<UserMarketInfo> {
        return this.routerStatic.multicallStatic.getUserMarketInfo(this.address, user, multicall);
    }

    async SY(multicall = this.multicall): Promise<Address> {
        return this._syAddress ?? this.getMarketInfo(multicall).then(({ sy }) => sy);
    }

    /**
     * Alias for Market#SY
     * @see MarketEntity#SY
     */
    async sy(multicall = this.multicall) {
        return this.SY(multicall);
    }

    async PT(multicall = this.multicall): Promise<Address> {
        return this._ptAddress ?? this.getMarketInfo(multicall).then(({ pt }) => pt);
    }

    /**
     * Alias for Market#PT
     * @see MarketEntity#PT
     */
    async pt(multicall = this.multicall) {
        return this.PT(multicall);
    }

    // Consideration: more efficient result caching?
    async syEntity(multicall = this.multicall) {
        const syAddr = await this.SY(multicall);
        return new SyEntity(syAddr, this.networkConnection, this.chainId);
    }

    // Consideration: more efficient result caching?
    async ptEntity(multicall = this.multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.networkConnection, this.chainId);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.marketContract.multicallStatic.getRewardTokens(multicall);
    }

    async redeemRewards<T extends MetaMethodType = 'send'>(userAddress: Address, metaMethodType?: T) {
        return this.marketContract.metaCall.redeemRewards(userAddress, metaMethodType);
    }

    async simulateRedeemRewards(userAddress: Address, multicall = this.multicall) {
        return this.marketContract.multicallStatic.redeemRewards(userAddress, multicall);
    }

    async simulateRedeemRewardsWithTokens(userAddress: Address, multicall = this.multicall): Promise<RawTokenAmount[]> {
        const [rewardTokens, rewards] = await Promise.all([
            this.getRewardTokens(multicall),
            this.simulateRedeemRewards(userAddress, multicall),
        ]);
        return Array.from(zip(rewardTokens, rewards), ([rewardToken, reward]) => ({
            token: rewardToken,
            amount: reward,
        }));
    }

    async activeBalance(userAddress: Address, multicall = this.multicall): Promise<BN> {
        return this.marketContract.multicallStatic.activeBalance(userAddress, multicall);
    }

    async readState(multicall = this.multicall) {
        return this.marketContract.multicallStatic.readState(multicall);
    }
}
