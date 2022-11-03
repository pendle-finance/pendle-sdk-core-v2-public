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

export type UserSyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export type SyEntityConfig = ERC20Config & {
    bulkSellerUsage?: BulkSellerUsageStrategy;
};

export class SyEntity<C extends WrappedContract<SYBase> = WrappedContract<SYBase>> extends ERC20<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly bulkSellerUsage: BulkSellerUsageStrategy;

    constructor(readonly address: Address, readonly chainId: ChainId, config: SyEntityConfig) {
        super(address, chainId, { abi: SYBaseABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
        this.bulkSellerUsage = config.bulkSellerUsage ?? getGlobalBulkSellerUsageStrategyGetter(this.routerStatic);
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

    async userInfo(user: Address, multicall = this.multicall): Promise<UserSyInfo> {
        return this.routerStatic.multicallStatic.getUserSYInfo(this.address, user, multicall);
    }

    async getTokensIn(multicall = this.multicall) {
        return this.contract.multicallStatic.getTokensIn(multicall);
    }

    async getTokensOut(multicall = this.multicall) {
        return this.contract.multicallStatic.getTokensOut(multicall);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.contract.multicallStatic.getRewardTokens(multicall);
    }

    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        useBulk: UseBulkMode = 'auto',
        multicall = this.multicall
    ): Promise<BN> {
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
                    multicall
                )
        );
    }

    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        useBulk: UseBulkMode = 'auto',
        multicall = this.multicall
    ): Promise<BN> {
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
                    multicall
                )
        );
    }
}
