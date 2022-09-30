import type { RouterStatic, SCYBase } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, RawTokenAmount, ChainId } from '../types';
import type { BigNumberish, ContractTransaction, Overrides } from 'ethers';
import { BigNumber as BN, ContractInterface } from 'ethers';
import { abi as SCYBaseABI } from '@pendle/core-v2/build/artifacts/contracts/SuperComposableYield/base-implementations/SCYBase.sol/SCYBase.json';
import { getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount } from './math';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';

export type UserScyInfo = {
    balance: BN;
    rewards: RawTokenAmount[];
};

export class ScyEntity extends ERC20 {
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = SCYBaseABI
    ) {
        super(address, networkConnection, chainId, abi);
        this.routerStatic = getRouterStatic(networkConnection, chainId);
    }

    get SCYBaseContract() {
        return this.contract as SCYBase;
    }

    get scyContract() {
        return this.SCYBaseContract;
    }

    /**
     * Allow the users to specify slippage instead of Min amount
     *
     * How it works?
     *
     * We will simulate how much SCY user can get out of his base assets, and apply (1 - slippage) to the simulated amount as minAmount
     * */
    async deposit(
        receiver: Address,
        baseAssetIn: Address,
        amountBaseToPull: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const amountScyOut = await this.scyContract.callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
            value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
        });
        return this.scyContract.deposit(
            receiver,
            baseAssetIn,
            amountBaseToPull,
            calcSlippedDownAmount(amountScyOut, slippage),
            {
                ...overrides,
                value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
            }
        );
    }

    /**
     * Similar to deposit, we allow the user to pass in slippage instead
     */
    async redeem(
        receiver: Address,
        baseAssetOut: Address,
        amountScyToPull: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const amountBaseOut = await this.scyContract.callStatic.redeem(receiver, amountScyToPull, baseAssetOut, 0);
        return this.scyContract.redeem(
            receiver,
            amountScyToPull,
            baseAssetOut,
            calcSlippedDownAmount(amountBaseOut, slippage),
            overrides
        );
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserScyInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserSCYInfo(this.address, user);
    }

    async getTokensIn(multicall?: Multicall) {
        return Multicall.wrap(this.scyContract, multicall).callStatic.getTokensIn();
    }

    async getTokensOut(multicall?: Multicall) {
        return Multicall.wrap(this.scyContract, multicall).callStatic.getTokensOut();
    }

    async getRewardTokens(multicall?: Multicall) {
        return Multicall.wrap(this.scyContract, multicall).callStatic.getRewardTokens();
    }

    async previewRedeem(tokenOut: Address, amountSharesToRedeem: BigNumberish, multicall?: Multicall): Promise<BN> {
        return Multicall.wrap(this.scyContract, multicall).callStatic.previewRedeem(tokenOut, amountSharesToRedeem);
    }
}
