import {
    PendleMarket,
    IPRouterStatic,
    IPActionInfoStatic,
    PendleMarketABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MulticallStaticParams,
    getRouterStatic,
    ContractMethodNames,
    MetaMethodReturnType,
} from '../contracts';
import { ERC20EntityConfig, ERC20Entity } from './erc20';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PtEntity, PtEntityConfig } from './PtEntity';
import { YtEntity, YtEntityConfig } from './YtEntity';
import {
    Address,
    toAddress,
    ChainId,
    RawTokenAmount,
    createTokenAmount,
    BN,
    zip,
    NATIVE_ADDRESS_0x00,
} from '../common';

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
    yt: Address;
    sy: Address;
    marketExchangeRateExcludeFee: BN;
    impliedYield: BN;
    state: MarketState;
};

export type AssetAmount = {
    assetType: number;
    assetAddress: Address;
    amount: BN;
};

export type UserMarketInfo = {
    lpBalance: RawTokenAmount;
    ptBalance: RawTokenAmount;
    syBalance: RawTokenAmount;
    unclaimedRewards: RawTokenAmount[];
};

export type MarketEntityMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<PendleMarket>,
    ExtraData extends {}
> = MetaMethodReturnType<T, PendleMarket, MethodName, ExtraData & MetaMethodExtraParams<T>>;

/**
 * The configuration of a {@link MarketEntity}.
 */
export type MarketEntityConfig = ERC20EntityConfig & {
    /**
     * The chainId. Used to get the {@link IPRouterStatic} for additional computation.
     */
    readonly chainId: ChainId;
};

export class MarketEntity extends ERC20Entity {
    protected readonly routerStatic: WrappedContract<IPRouterStatic>;
    protected _ptAddress: Address | undefined;
    protected _syAddress: Address | undefined;
    protected _ytAddress: Address | undefined;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: MarketEntityConfig) {
        super(address, { abi: PendleMarketABI, ...config });
        this.chainId = config.chainId;
        this.routerStatic = getRouterStatic(config);
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract() {
        return this._contract as WrappedContract<PendleMarket>;
    }

    /**
     * Get the info of the market.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getMarketInfo(params?: MulticallStaticParams): Promise<MarketInfo> {
        const res = await this.routerStatic.multicallStatic.getMarketState(this.address, params);
        this._ptAddress = toAddress(res.pt);
        this._syAddress = toAddress(res.sy);
        this._ytAddress = toAddress(res.yt);
        return {
            ...res,
            pt: this._ptAddress,
            sy: this._syAddress,
            yt: this._ytAddress,
            state: { ...res.state, treasury: toAddress(res.state.treasury) },
        };
    }

    /**
     * Get the market info of an user.
     * @param user
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getUserMarketInfo(user: Address, params?: MulticallStaticParams): Promise<UserMarketInfo> {
        return this.routerStatic.multicallStatic
            .getUserMarketInfo(this.address, user, params)
            .then(MarketEntity.toUserMarketInfo);
    }

    /**
     * Convert {@link IPRouterStatic.UserMarketInfoStructOutput} to {@link UserMarketInfo}.
     * @remarks
     * Both structures have the same shape, but the return type has a stricter type.
     */
    static toUserMarketInfo({
        lpBalance,
        ptBalance,
        syBalance,
        unclaimedRewards,
    }: IPActionInfoStatic.UserMarketInfoStructOutput): UserMarketInfo {
        return {
            lpBalance: createTokenAmount(lpBalance),
            ptBalance: createTokenAmount(ptBalance),
            syBalance: createTokenAmount(syBalance),
            unclaimedRewards: unclaimedRewards.map(createTokenAmount),
        };
    }

    /**
     * Get the address of the SY token, correspond to this market.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async SY(params?: MulticallStaticParams): Promise<Address> {
        return this._syAddress ?? this.getMarketInfo(params).then(({ sy }) => sy);
    }

    /**
     * Alias for {@link MarketEntity#SY}
     */
    async sy(params?: MulticallStaticParams) {
        return this.SY(params);
    }

    /**
     * Get the address of the PT token, correspond to this market.
     * @remarks
     * The naming is in uppercase to reflect the same function of the contract.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async PT(params?: MulticallStaticParams): Promise<Address> {
        return this._ptAddress ?? this.getMarketInfo(params).then(({ pt }) => pt);
    }

    /**
     * Alias for {@link MarketEntity#PT}
     */
    async pt(params?: MulticallStaticParams) {
        return this.PT(params);
    }

    async YT(params?: MulticallStaticParams): Promise<Address> {
        return this._ytAddress ?? this.getMarketInfo(params).then(({ yt }) => yt);
    }

    /**
     * Alias for {@link MarketEntity#YT}
     */
    async yt(params?: MulticallStaticParams): Promise<Address> {
        return this.YT(params);
    }

    get entityConfig(): MarketEntityConfig {
        return { ...super.entityConfig, chainId: this.chainId };
    }

    /**
     * Get the entity of the SY token, correspond to this market.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the SY token.
     * @returns
     */
    // Consideration: more efficient result caching?
    async syEntity(params?: MulticallStaticParams & { entityConfig?: SyEntityConfig }) {
        const syAddr = await this.SY(params);
        return new SyEntity(syAddr, params?.entityConfig ?? this.entityConfig);
    }

    /**
     * Get the entity of the PT token, correspond to this market.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the PT token.
     * @returns
     */
    // Consideration: more efficient result caching?
    async ptEntity(params?: MulticallStaticParams & { entityConfig?: PtEntityConfig }) {
        const ptAddr = await this.PT(params);
        return new PtEntity(ptAddr, params?.entityConfig ?? this.entityConfig);
    }

    /**
     * Get the entity of the PT token, correspond to this market.
     *
     * @param params - the additional parameters for read method.
     * @param params.entityConfig - the additional config for the PT token.
     * @returns
     */
    // Consideration: more efficient result caching?
    async ytEntity(params?: MulticallStaticParams & { entityConfig?: YtEntityConfig }) {
        const ytAddr = await this.YT(params);
        return new YtEntity(ytAddr, params?.entityConfig ?? this.entityConfig);
    }

    /**
     * Get the reward tokens of a market.
     * @param params - the additional parameters for read method.
     * @returns List of addresses of the reward tokens.
     */
    async getRewardTokens(params?: MulticallStaticParams): Promise<Address[]> {
        const res = await this.contract.multicallStatic.getRewardTokens(params);
        return res.map(toAddress);
    }

    /**
     * Perform the redeem reward action.
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param userAddress - the receiver address.
     * @param params - the additional parameters for **write** method.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async redeemRewards<T extends MetaMethodType>(
        userAddress: Address,
        params: MetaMethodExtraParams<T> = {}
    ): MarketEntityMetaMethodReturnType<T, 'redeemRewards', {}> {
        return this.contract.metaCall.redeemRewards(userAddress, this.addExtraParams(params));
    }

    /**
     * Simulate the redeem rewards actions, and return only the amounts for each reward tokens.
     * @remarks
     *
     * This function cannot be called with multicall because it is not a `views` function.
     * Calling with multicall will mutate the contract's state.
     * @param userAddress - the receiver address.
     */
    // TODO Add overrides
    async simulateRedeemRewards(userAddress: Address): Promise<BN[]> {
        return this.contract.callStatic.redeemRewards(userAddress);
    }

    /**
     * Simulate the redeem rewards actions, and return only the list of pair of
     * token address with the corresponding amount.
     * @param userAddress
     * @param params - the additional parameters for read method.
     * @returns
     */
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

    /**
     * Get the active balance of a give user.
     * @param userAddress
     * @param params - the additional parameters for read method.
     * @returns
     */
    async activeBalance(userAddress: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.activeBalance(userAddress, params);
    }

    /**
     * Get the market state of a given router.
     * @param params - the additional parameters for read method.
     * @param params.routerAddress - the router address to check the market state.
     * @returns The market state base on the router address.
     */
    async readState(params?: MulticallStaticParams & { routerAddress?: Address }): Promise<MarketState> {
        const router = params?.routerAddress ?? NATIVE_ADDRESS_0x00;
        const res = await this.contract.multicallStatic.readState(router, params);
        return { ...res, treasury: toAddress(res.treasury) };
    }
}
