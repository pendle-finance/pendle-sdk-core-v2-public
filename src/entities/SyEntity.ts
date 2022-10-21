import { RouterStatic, SYBase, SYBaseABI, WrappedContract, MetaMethodType } from '../contracts';
import type { Address, RawTokenAmount, ChainId } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount } from './math';
import { ERC20, ERC20Config } from './ERC20';

export type UserSyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export type SyEntityConfig = ERC20Config;

export class SyEntity<C extends WrappedContract<SYBase> = WrappedContract<SYBase>> extends ERC20<C> {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(readonly address: Address, readonly chainId: ChainId, config: SyEntityConfig) {
        super(address, chainId, { abi: SYBaseABI, ...config });
        this.routerStatic = getRouterStatic(chainId, config);
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
        metaMethodType?: T
    ) {
        const amountSyOut = await this.contract.callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
            value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
        });
        return this.contract.metaCall.deposit(
            receiver,
            baseAssetIn,
            amountBaseToPull,
            calcSlippedDownAmount(amountSyOut, slippage),
            metaMethodType,
            { overrides: { value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined } }
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
        metaMethodType?: T
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
            metaMethodType
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
        multicall = this.multicall
    ): Promise<BN> {
        return this.contract.multicallStatic.previewRedeem(tokenOut, amountSharesToRedeem, multicall);
    }

    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        multicall = this.multicall
    ): Promise<BN> {
        return this.contract.multicallStatic.previewRedeem(tokenIn, amountTokenToDeposit, multicall);
    }
}
