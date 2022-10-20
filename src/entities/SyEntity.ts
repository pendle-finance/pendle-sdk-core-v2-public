import type { RouterStatic, SYBase } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, RawTokenAmount, ChainId } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { abi as SYBaseABI } from '@pendle/core-v2/build/artifacts/contracts/core/StandardizedYield/SYBase.sol/SYBase.json';
import { getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount } from './math';
import { ERC20, ERC20Config } from './ERC20';
import { WrappedContract, MetaMethodType } from '../contractHelper';

export type UserSyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export type SyEntityConfig = ERC20Config;

export class SyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: SyEntityConfig
    ) {
        super(address, networkConnection, chainId, { abi: SYBaseABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    get SYBaseContract() {
        return this.contract as WrappedContract<SYBase>;
    }

    get syContract() {
        return this.SYBaseContract;
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
        const amountSyOut = await this.syContract.callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
            value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
        });
        return this.syContract.metaCall.deposit(
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
        const amountBaseOut = await this.syContract.callStatic.redeem(
            receiver,
            amountSyToPull,
            baseAssetOut,
            0,
            burnFromInternalBalance
        );
        return this.syContract.metaCall.redeem(
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
        return this.syContract.multicallStatic.getTokensIn(multicall);
    }

    async getTokensOut(multicall = this.multicall) {
        return this.syContract.multicallStatic.getTokensOut(multicall);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.syContract.multicallStatic.getRewardTokens(multicall);
    }

    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        multicall = this.multicall
    ): Promise<BN> {
        return this.syContract.multicallStatic.previewRedeem(tokenOut, amountSharesToRedeem, multicall);
    }

    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        multicall = this.multicall
    ): Promise<BN> {
        return this.syContract.multicallStatic.previewRedeem(tokenIn, amountTokenToDeposit, multicall);
    }
}
