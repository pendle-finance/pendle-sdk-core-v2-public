import {
    SYBase,
    SYBaseABI,
    WrappedContract,
    MetaMethodType,
    mergeMetaMethodExtraParams as mergeParams,
    MetaMethodExtraParams,
    MulticallStaticParams,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
} from '../contracts';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { ERC20Entity, ERC20EntityConfig } from './erc20';
import { Address, toAddress, isNativeToken, ChainId, RawTokenAmount } from '../common';
import { calcSlippedDownAmount } from '../common/math';
import { Multicall } from '../multicall';
import * as iters from 'itertools';

export type UserSyInfo = {
    syBalance: RawTokenAmount;
    unclaimedRewards: RawTokenAmount[];
};

/**
 * Configuration for {@link SyEntity}
 */
export type SyEntityConfig = ERC20EntityConfig & {
    chainId: ChainId;
};

export type SyEntityMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<SYBase>,
    ExtraData extends object = object,
> = MetaMethodReturnType<T, SYBase, MethodName, ExtraData & MetaMethodExtraParams<T>>;

/**
 * This class represent a Standardized Yield (SY) token.
 */
export class SyEntity extends ERC20Entity {
    readonly chainId: ChainId;

    constructor(
        readonly address: Address,
        config: SyEntityConfig
    ) {
        super(address, { abi: SYBaseABI, ...config });
        this.chainId = config.chainId;
    }

    get contract() {
        return this._contract as WrappedContract<SYBase>;
    }

    override get entityConfig(): SyEntityConfig {
        return {
            ...this.networkConnection,
            chainId: this.chainId,
            multicall: this.multicall,
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
     * @param baseAssetIn - the base asset's Address to deposit
     * @param amountBaseToPull
     * @param slippage
     * @param params - the additional parameters for **write** method
     * @param params.receiver - the receiver's Address. Default is the signer address.
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
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        params?: MetaMethodExtraParams<T> & { receiver?: Address }
    ): SyEntityMetaMethodReturnType<T, 'deposit', { amountSyOut: BN }> {
        const amountSyOut = await this.previewDeposit(baseAssetIn, amountBaseToPull, {
            ...params,
        });
        return this.contract.metaCall.deposit(
            params?.receiver ?? ContractMetaMethod.utils.getContractSignerAddress,
            baseAssetIn,
            amountBaseToPull,
            calcSlippedDownAmount(amountSyOut, slippage),
            mergeParams({
                ...params,
                overrides: {
                    value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
                    ...params?.overrides,
                },
                amountSyOut,
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
     * @param baseAssetOut - the base asset's Address to redeem
     * @param amountSyToPull
     * @param slippage
     * @param params - the additional parameters for **write** method
     * @param params.burnFromInternalBalance
     * @param params.receiver - the receiver's address. Default is the signer's address.
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
        baseAssetOut: Address,
        amountSyToPull: BigNumberish,
        slippage: number,
        params?: MetaMethodExtraParams<T> & {
            burnFromInternalBalance?: boolean;
            receiver?: Address;
        }
    ): SyEntityMetaMethodReturnType<T, 'redeem', { amountBaseOut: BN }> {
        const burnFromInternalBalance = params?.burnFromInternalBalance ?? false;
        const amountBaseOut = await this.previewRedeem(baseAssetOut, amountSyToPull, { ...params });
        return this.contract.metaCall.redeem(
            params?.receiver ?? ContractMetaMethod.utils.getContractSignerAddress,
            amountSyToPull,
            baseAssetOut,
            calcSlippedDownAmount(amountBaseOut, slippage),
            burnFromInternalBalance,
            { ...params, amountBaseOut }
        );
    }

    /**
     * Get SY user information.
     * @param user
     * @param params - the additional parameters for read method.
     * @returns
     */
    async userInfo(
        user: Address,
        params?: MulticallStaticParams & { multicallForSimulateClaimRewards?: Multicall }
    ): Promise<UserSyInfo> {
        const [syBalance, rewardTokens, rewardsOut] = await Promise.all([
            this.contract.multicallStatic.balanceOf(user, params),
            this.getRewardTokens(params),
            this.contract.multicallStatic.claimRewards(user, {
                ...params,
                multicall: params?.multicallForSimulateClaimRewards,
            }),
        ]);
        const unclaimedRewards = iters.map(iters.izip(rewardTokens, rewardsOut), ([token, amount]) => ({
            token,
            amount,
        }));
        return {
            syBalance: { token: this.address, amount: syBalance },
            unclaimedRewards,
        };
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
     * @returns the redeemed raw amount of `tokenOut`
     */
    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        params: MulticallStaticParams = {}
    ): Promise<BN> {
        return this.contract.multicallStatic.previewRedeem(tokenOut, amountSharesToRedeem, params);
    }

    /**
     * Simulate the deposit process.
     * @param tokenIn
     * @param amountTokenToDeposit
     * @param params - the additional parameters for read method.
     * @returns the deposited raw amount of SY
     */
    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        params: MulticallStaticParams = {}
    ): Promise<BN> {
        return this.contract.multicallStatic.previewDeposit(tokenIn, amountTokenToDeposit, params);
    }
}
