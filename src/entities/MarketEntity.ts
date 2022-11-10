import {
    PendleMarket,
    RouterStatic,
    PendleMarketABI,
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
} from '../contracts';
import type { Address, RawTokenAmount, MulticallStaticParams } from '../types';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, zip, toAddress, createTokenAmount } from './helper';
import { ERC20, ERC20Config } from './ERC20';
import { ChainId } from '../types';
import { SyEntity, SyEntityConfig } from './SyEntity';
import { PtEntity, PtEntityConfig } from './PtEntity';

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
    assetType: BN;
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
    }: RouterStatic.UserMarketInfoStruct): UserMarketInfo {
        return {
            market: toAddress(market),
            lpBalance: BN.from(lpBalance),
            ptBalance: createTokenAmount(ptBalance),
            syBalance: createTokenAmount(syBalance),
            assetBalance: {
                assetType: BN.from(assetBalance.assetType),
                assetAddress: toAddress(assetBalance.assetAddress),
                amount: BN.from(assetBalance.amount),
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
