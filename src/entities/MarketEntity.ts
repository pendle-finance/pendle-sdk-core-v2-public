import {
    PendleMarket,
    RouterStatic,
    PendleMarketABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MulticallStaticParams,
    getRouterStatic,
} from '../contracts';
import { ERC20, ERC20Config } from './ERC20';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { Address, toAddress, ChainId, RawTokenAmount, createTokenAmount, BN, zip } from '../common';

export type MarketState = {
    totalPt: BN;
    totalSy: BN;
    totalLp: BN;
    treasury: Address;
    scalarRoot: BN;
    lnFeeRateRoot: BN;
    expiry: BN;
    reserveFeePercent: BN;
    lastLnImpliedRate: BN;
};

export type MarketInfo = {
    pt: Address;
    sy: Address;
    state: MarketState;
    impliedYield: BN;
    exchangeRate: BN;
};

export type AssetAmount = {
    assetType: number;
    assetAddress: Address;
    amount: BN;
};

export type UserMarketInfo = {
    market: Address;
    lpBalance: BN;
    ptBalance: RawTokenAmount;
    syBalance: RawTokenAmount;
    assetBalance: AssetAmount;
};

export type MarketEntityConfig = ERC20Config & {
    readonly chainId: ChainId;
};

export class MarketEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    protected _ptAddress: Address | undefined;
    protected _syAddress: Address | undefined;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: MarketEntityConfig) {
        super(address, { abi: PendleMarketABI, ...config });
        this.chainId = config.chainId;
        this.routerStatic = getRouterStatic(config);
    }

    get contract() {
        return this._contract as WrappedContract<PendleMarket>;
    }

    async getMarketInfo(params?: MulticallStaticParams): Promise<MarketInfo> {
        const res = await this.routerStatic.multicallStatic.getMarketInfo(this.address, params);
        this._ptAddress = toAddress(res.pt);
        this._syAddress = toAddress(res.sy);
        return {
            ...res,
            pt: this._ptAddress,
            sy: this._syAddress,
            state: { ...res.state, treasury: toAddress(res.state.treasury) },
        };
    }

    async getUserMarketInfo(user: Address, params?: MulticallStaticParams): Promise<UserMarketInfo> {
        return this.routerStatic.multicallStatic
            .getUserMarketInfo(this.address, user, params)
            .then(MarketEntity.toUserMarketInfo);
    }

    static toUserMarketInfo({
        market,
        lpBalance,
        ptBalance,
        syBalance,
        assetBalance,
    }: RouterStatic.UserMarketInfoStructOutput): UserMarketInfo {
        return {
            market: toAddress(market),
            lpBalance: BN.from(lpBalance),
            ptBalance: createTokenAmount(ptBalance),
            syBalance: createTokenAmount(syBalance),
            assetBalance: {
                assetType: assetBalance.assetType,
                assetAddress: toAddress(assetBalance.assetAddress),
                amount: assetBalance.amount,
            },
        };
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

    get entityConfig(): MarketEntityConfig {
        return { ...super.entityConfig, chainId: this.chainId };
    }

    // Consideration: more efficient result caching?
    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, params?.entityConfig ?? this.entityConfig);
    }

    // Consideration: more efficient result caching?
    async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, params?.entityConfig ?? this.entityConfig);
    }

    async getRewardTokens(params?: MulticallStaticParams): Promise<Address[]> {
        const res = await this.contract.multicallStatic.getRewardTokens(params);
        return res.map(toAddress);
    }

    async redeemRewards<T extends MetaMethodType>(userAddress: Address, params: MetaMethodExtraParams<T> = {}) {
        return this.contract.metaCall.redeemRewards(userAddress, this.addExtraParams(params));
    }

    /**
     * This function cannot be called with multicall because it is not a `views` function.
     * Calling with multicall will mutate the contract's state.
     */
    async simulateRedeemRewards(userAddress: Address): Promise<BN[]> {
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

    async readState(params?: MulticallStaticParams): Promise<MarketState> {
        const res = await this.contract.multicallStatic.readState(params);
        return { ...res, treasury: toAddress(res.treasury) };
    }
}
