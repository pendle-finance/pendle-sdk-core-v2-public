import type { RouterStatic, SCYBase } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, RawTokenAmount, ChainId } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { abi as SCYBaseABI } from '@pendle/core-v2/build/artifacts/contracts/core/SuperComposableYield/SCYBase.sol/SCYBase.json';
import { getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount } from './math';
import { ERC20, ERC20Config } from './ERC20';
import { WrappedContract, MetaMethodType } from '../contractHelper';

export type UserScyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export type ScyEntityConfig = ERC20Config;

export class ScyEntity extends ERC20 {
    protected readonly routerStatic: WrappedContract<RouterStatic>;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config?: ScyEntityConfig
    ) {
        super(address, networkConnection, chainId, { abi: SCYBaseABI, ...config });
        this.routerStatic = getRouterStatic(networkConnection, chainId, config);
    }

    get SCYBaseContract() {
        return this.contract as WrappedContract<SCYBase>;
    }

    get scyContract() {
        return this.SCYBaseContract;
    }

    /**
     * Allow the users to specify slippage instead of Min amount
     *
     * How it works?
     *
     * We will simulate how much SCY user can get out of his base assets, and
     * apply (1 - slippage) to the simulated amount as minAmount
     * */
    async deposit<T extends MetaMethodType = 'send'>(
        receiver: Address,
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ) {
        const amountScyOut = await this.scyContract.callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
            value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
        });
        return this.scyContract.metaCall.deposit(
            receiver,
            baseAssetIn,
            amountBaseToPull,
            calcSlippedDownAmount(amountScyOut, slippage),
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
        amountScyToPull: BigNumberish,
        slippage: number,
        burnFromInternalBalance: boolean,
        metaMethodType?: T
    ) {
        const amountBaseOut = await this.scyContract.callStatic.redeem(
            receiver,
            amountScyToPull,
            baseAssetOut,
            0,
            burnFromInternalBalance
        );
        return this.scyContract.metaCall.redeem(
            receiver,
            amountScyToPull,
            baseAssetOut,
            calcSlippedDownAmount(amountBaseOut, slippage),
            burnFromInternalBalance,
            metaMethodType
        );
    }

    async userInfo(user: Address, multicall = this.multicall): Promise<UserScyInfo> {
        return this.routerStatic.multicallStatic.getUserSCYInfo(this.address, user, multicall);
    }

    async getTokensIn(multicall = this.multicall) {
        return this.scyContract.multicallStatic.getTokensIn(multicall);
    }

    async getTokensOut(multicall = this.multicall) {
        return this.scyContract.multicallStatic.getTokensOut(multicall);
    }

    async getRewardTokens(multicall = this.multicall) {
        return this.scyContract.multicallStatic.getRewardTokens(multicall);
    }

    async previewRedeem(
        tokenOut: Address,
        amountSharesToRedeem: BigNumberish,
        multicall = this.multicall
    ): Promise<BN> {
        return this.scyContract.multicallStatic.previewRedeem(tokenOut, amountSharesToRedeem, multicall);
    }

    async previewDeposit(
        tokenIn: Address,
        amountTokenToDeposit: BigNumberish,
        multicall = this.multicall
    ): Promise<BN> {
        return this.scyContract.multicallStatic.previewRedeem(tokenIn, amountTokenToDeposit, multicall);
    }
}
