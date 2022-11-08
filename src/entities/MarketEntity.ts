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
import type { Address, RawTokenAmount, MulticallStaticParams } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, zip } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { ChainId } from '../types';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PtEntity, PtEntityConfig } from './PtEntity';

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

    constructor(readonly address: Address, readonly chainId: ChainId, config: MarketEntityConfig) {
        super(address, chainId, { abi: PendleMarketABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
    }

    get contract() {
        return this._contract as WrappedContract<PendleMarket>;
    }

    async getMarketInfo(params?: MulticallStaticParams): Promise<MarketInfo> {
        const res = await this.routerStatic.multicallStatic.getMarketInfo(this.address, params);
        this._ptAddress = res.pt;
        this._syAddress = res.sy;
        return res;
    }

    async getUserMarketInfo(user: Address, params?: MulticallStaticParams): Promise<UserMarketInfo> {
        return this.routerStatic.multicallStatic.getUserMarketInfo(this.address, user, params);
    }

    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this._syAddress ?? this.getMarketInfo(params).then(({ sy }) => sy);
    }

    /**
     * Alias for Market#SY
     * @see MarketEntity#SY
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    async PT(params?: MulticallStaticParams): Promise<Address> {
        return this._ptAddress ?? this.getMarketInfo(params).then(({ pt }) => pt);
    }

    /**
     * Alias for Market#PT
     * @see MarketEntity#PT
     */
    async pt(params?: MulticallStaticParams) {
        return this.PT(params);
    }

    // Consideration: more efficient result caching?
    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    // Consideration: more efficient result caching?
    async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, this.chainId, params?.entityConfig ?? this.entityConfig);
    }

    async getRewardTokens(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.getRewardTokens(params);
    }

    async redeemRewards<T extends MetaMethodType>(userAddress: Address, params: MetaMethodExtraParams<T> = {}) {
        return this.contract.metaCall.redeemRewards(userAddress, this.addExtraParams(params));
    }

    /**
     * This function cannot be called with multicall because it is not a `views` function.
     * Calling with multicall will mutate the contract's state.
     */
    async simulateRedeemRewards(userAddress: Address) {
        return this.contract.callStatic.redeemRewards(userAddress);
    }

    async simulateRedeemRewardsWithTokens(
        userAddress: Address,
        params?: MulticallStaticParams
    ): Promise<RawTokenAmount[]> {
        const [rewardTokens, rewards] = await Promise.all([
            this.getRewardTokens(params),
            this.simulateRedeemRewards(userAddress),
        ]);
        return Array.from(zip(rewardTokens, rewards), ([rewardToken, reward]) => ({
            token: rewardToken,
            amount: reward,
        }));
    }

    async activeBalance(userAddress: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.activeBalance(userAddress, params);
    }

    async readState(params?: MulticallStaticParams) {
        return this.contract.multicallStatic.readState(params);
    }
}
