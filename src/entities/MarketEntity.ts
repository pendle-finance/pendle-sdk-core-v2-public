import {
    PendleMarket,
    MarketStateStructOutput,
    IPRouterStatic,
    RouterStatic,
    PendleMarketABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
} from '../contracts';
import type { Address, RawTokenAmount } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, zip } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { ChainId } from '../types';
import { SyEntity } from './SyEntity';
import { PtEntity } from './PtEntity';

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

export class MarketEntity<C extends WrappedContract<PendleMarket> = WrappedContract<PendleMarket>> extends ERC20<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    protected _ptAddress: Address | undefined;
    protected _syAddress: Address | undefined;

    constructor(readonly address: Address, readonly chainId: ChainId, config: MarketEntityConfig) {
        super(address, chainId, { abi: PendleMarketABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
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
        return new SyEntity(syAddr, this.chainId, this.networkConnection);
    }

    // Consideration: more efficient result caching?
    async ptEntity(multicall = this.multicall) {
        const ptAddr = await this.PT(multicall);
        return new PtEntity(ptAddr, this.chainId, this.networkConnection);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.contract.multicallStatic.getRewardTokens(multicall);
    }

    async redeemRewards<T extends MetaMethodType>(userAddress: Address, params: MetaMethodExtraParams<T> = {}) {
        return this.contract.metaCall.redeemRewards(userAddress, this.addExtraParams(params));
    }

    async simulateRedeemRewards(userAddress: Address, multicall = this.multicall) {
        return this.contract.multicallStatic.redeemRewards(userAddress, multicall);
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
        return this.contract.multicallStatic.activeBalance(userAddress, multicall);
    }

    async readState(multicall = this.multicall) {
        return this.contract.multicallStatic.readState(multicall);
    }
}
