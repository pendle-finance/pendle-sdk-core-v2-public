import {
    RouterStatic,
    SYBase,
    SYBaseABI,
    WrappedContract,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
    MetaMethodExtraParams,
    MulticallStaticParams,
    getRouterStatic,
    MetaMethodReturnType,
    ContractMethodNames,
} from '../contracts';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { ERC20, ERC20Config } from './ERC20';
import { BulkSellerUsageStrategy, UseBulkMode } from '../bulkSeller';
import { Address, toAddress, isNativeToken, ChainId, RawTokenAmount, createTokenAmount } from '../common';
import { calcSlippedDownAmount } from '../common/math';
import { getGlobalBulkSellerUsageStrategyGetter } from '../bulkSeller/defaultStrategy';

export type UserSyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

/**
 * Configuration for {@link SyEntity}
 */
export type SyEntityConfig = ERC20Config & {
    chainId: ChainId;
    bulkSellerUsage?: BulkSellerUsageStrategy;
};

export type SyEntityMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<SYBase>,
    ExtraData extends {} = {}
> = MetaMethodReturnType<T, SYBase, MethodName, ExtraData & MetaMethodExtraParams<T>>;

/**
 * This class represent a Standardized Yield (SY) token.
 */
export class SyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;
    readonly bulkSellerUsage: BulkSellerUsageStrategy;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: SyEntityConfig) {
        super(address, { abi: SYBaseABI, ...config });
        this.chainId = config.chainId;
        this.routerStatic = getRouterStatic(config);
        this.bulkSellerUsage = config.bulkSellerUsage ?? getGlobalBulkSellerUsageStrategyGetter(this.routerStatic);
    }

    get contract() {
        return this._contract as WrappedContract<SYBase>;
    }

    override get entityConfig(): SyEntityConfig {
        return {
            ...this.networkConnection,
            chainId: this.chainId,
            multicall: this.multicall,
            bulkSellerUsage: this.bulkSellerUsage,
        };
    }

    /**
     * Deposit SY from a given token in
     * @privateRemarks
     * Allow the users to specify slippage instead of Min amount
     *
     * We will simulate how much SY user can get out of his base assets, and
     * apply (1 - slippage) to the simulated amount as minAmount
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param receiver - the receiver's Address
     * @param baseAssetIn - the base asset's Address to deposit
     * @param amountBaseToPull
     * @param slippage
     * @param params - the additional parameters for **write** method
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     * */
    async deposit<T extends MetaMethodType = 'send'>(
        receiver: Address,
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        params?: MetaMethodExtraParams<T>
    ): SyEntityMetaMethodReturnType<T, 'deposit'> {
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
     * Redeem SY to a given token out.
     *
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param receiver - the receiver's Address
     * @param baseAssetOut - the base asset's Address to redeem
     * @param amountSyToPull
     * @param slippage
     * @param params - the additional parameters for **write** method
     * @param params.burnFromInternalBalance
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async redeem<T extends MetaMethodType = 'send'>(
        receiver: Address,
        baseAssetOut: Address,
        amountSyToPull: BigNumberish,
        slippage: number,
        params?: MetaMethodExtraParams<T> & { burnFromInternalBalance?: boolean }
    ): SyEntityMetaMethodReturnType<T, 'redeem'> {
        const burnFromInternalBalance = params?.burnFromInternalBalance ?? false;
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

    /**
     * Get SY user information.
     * @param user
     * @param params - the additional parameters for read method.
     * @returns
     */
    async userInfo(user: Address, params?: MulticallStaticParams): Promise<UserSyInfo> {
        const { balance, rewards } = await this.routerStatic.multicallStatic.getUserSYInfo(this.address, user, params);
        return { balance, rewards: rewards.map(createTokenAmount) };
    }

    /**
     * Get the list of addresses of the base tokens in, corresponding to this SY token.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getTokensIn(params?: MulticallStaticParams): Promise<Address[]> {
        const results = await this.contract.multicallStatic.getTokensIn(params);
        return results.map(toAddress);
    }

    /**
     * Get the list of addresses of the base tokens out, corresponding to this SY token.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getTokensOut(params?: MulticallStaticParams): Promise<Address[]> {
        const results = await this.contract.multicallStatic.getTokensOut(params);
        return results.map(toAddress);
    }

    /**
     * Get the list of addresses of the reward tokens, corresponding to this SY token.
     * @param params - the additional parameters for read method.
     * @returns
     */
    async getRewardTokens(params?: MulticallStaticParams): Promise<Address[]> {
        const results = await this.contract.multicallStatic.getRewardTokens(params);
        return results.map(toAddress);
    }

    /**
     * Simulate the redeem process.
     *
     * @param tokenOut
     * @param amountSharesToRedeem
     * @param params - the additional parameters for read method.
     * @param params.useBulk - specify whether to use bulk seller.
     * @returns the redeemed raw amount of `tokenOut`
     */
    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        params?: MulticallStaticParams & {
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

    /**
     * Simulate the deposit process.
     * @param tokenIn
     * @param amountTokenToDeposit
     * @param params - the additional parameters for read method.
     * @param params.useBulk - specify whether to use bulk seller.
     * @returns the deposited raw amount of SY
     */
    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        params?: MulticallStaticParams & {
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
