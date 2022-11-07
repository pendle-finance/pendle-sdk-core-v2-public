import {
    RouterStatic,
    SYBase,
    SYBaseABI,
    WrappedContract,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
    MetaMethodExtraParams,
} from '../contracts';
import type { Address, RawTokenAmount, ChainId } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, isNativeToken, getGlobalBulkSellerUsageStrategyGetter } from './helper';
import { calcSlippedDownAmount } from './math';
import { ERC20, ERC20Config } from './ERC20';
import { BulkSellerUsageStrategy, UseBulkMode } from '../bulkSeller';
import { Multicall } from '../multicall';

export type UserSyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export type SyEntityConfig = ERC20Config & {
    bulkSellerUsage?: BulkSellerUsageStrategy;
};

export class SyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly bulkSellerUsage: BulkSellerUsageStrategy;

    constructor(readonly address: Address, readonly chainId: ChainId, config: SyEntityConfig) {
        super(address, chainId, { abi: SYBaseABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
        this.bulkSellerUsage = config.bulkSellerUsage ?? getGlobalBulkSellerUsageStrategyGetter(this.routerStatic);
    }

    get contract() {
        return this._contract as WrappedContract<SYBase>;
    }

    override get entityConfig(): SyEntityConfig {
        return { ...this.networkConnection, multicall: this.multicall, bulkSellerUsage: this.bulkSellerUsage };
    }

    /**
     * Allow the users to specify slippage instead of Min amount
     *
     * How it works?
     *
     * We will simulate how much SY user can get out of his base assets, and
     * apply (1 - slippage) to the simulated amount as minAmount
     * */
    async deposit<T extends MetaMethodType = 'send'>(
        receiver: Address,
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        params?: MetaMethodExtraParams<T>
    ) {
        const amountSyOut = await this.contract.callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
            value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
        });
        return this.contract.metaCall.deposit(
            receiver,
            baseAssetIn,
            amountBaseToPull,
            calcSlippedDownAmount(amountSyOut, slippage),
            mergeParams(params ?? {}, {
                overrides: { value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined },
            })
        );
    }

    /**
     * Similar to deposit, we allow the user to pass in slippage instead
     */
    async redeem<T extends MetaMethodType = 'send'>(
        receiver: Address,
        baseAssetOut: Address,
        amountSyToPull: BigNumberish,
        slippage: number,
        burnFromInternalBalance: boolean,
        params?: MetaMethodExtraParams<T>
    ) {
        const amountBaseOut = await this.contract.callStatic.redeem(
            receiver,
            amountSyToPull,
            baseAssetOut,
            0,
            burnFromInternalBalance
        );
        return this.contract.metaCall.redeem(
            receiver,
            amountSyToPull,
            baseAssetOut,
            calcSlippedDownAmount(amountBaseOut, slippage),
            burnFromInternalBalance,
            params
        );
    }

    async userInfo(user: Address, params?: { multicall?: Multicall }): Promise<UserSyInfo> {
        return this.routerStatic.multicallStatic.getUserSYInfo(this.address, user, params);
    }

    async getTokensIn(params?: { multicall?: Multicall }) {
        return this.contract.multicallStatic.getTokensIn(params);
    }

    async getTokensOut(params?: { multicall?: Multicall }) {
        return this.contract.multicallStatic.getTokensOut(params);
    }

    async getRewardTokens(params?: { multicall?: Multicall }) {
        return this.contract.multicallStatic.getRewardTokens(params);
    }

    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        params?: {
            multicall?: Multicall;
            useBulk?: UseBulkMode;
        }
    ): Promise<BN> {
        const useBulk = params?.useBulk ?? 'auto';
        return this.bulkSellerUsage.tryInvokeWithSy(
            useBulk,
            { token: this.address, amount: amountSharesToRedeem },
            tokenOut,
            (bulkSellerAddress) =>
                this.routerStatic.multicallStatic.previewRedeemStatic(
                    this.address,
                    tokenOut,
                    amountSharesToRedeem,
                    bulkSellerAddress,
                    params
                )
        );
    }

    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        params?: {
            multicall?: Multicall;
            useBulk: UseBulkMode;
        }
    ): Promise<BN> {
        const useBulk = params?.useBulk ?? 'auto';
        return this.bulkSellerUsage.tryInvokeWithToken(
            useBulk,
            { token: tokenIn, amount: amountTokenToDeposit },
            this.address,
            (bulkSellerAddress) =>
                this.routerStatic.multicallStatic.previewDepositStatic(
                    this.address,
                    tokenIn,
                    amountTokenToDeposit,
                    bulkSellerAddress,
                    params
                )
        );
    }
}
