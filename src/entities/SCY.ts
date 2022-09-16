import type { RouterStatic, SCYBase } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount, ChainId } from '../types';
import type { BigNumberish, ContractTransaction, Overrides } from 'ethers';
import { BigNumber as BN, Contract } from 'ethers';
import { abi as SCYBaseABI } from '@pendle/core-v2/build/artifacts/contracts/SuperComposableYield/base-implementations/SCYBase.sol/SCYBase.json';
import { calcSlippedDownAmount, getRouterStatic, isNativeToken } from './helper';
import { ERC20 } from './ERC20';
import { Multicall } from '../multicall';

export type UserSCYInfo = {
    balance: BN;
    rewards: TokenAmount[];
};

export class SCY {
    readonly ERC20: ERC20;
    readonly contract: SCYBase;
    protected readonly routerStatic: RouterStatic;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId
    ) {
        this.ERC20 = new ERC20(address, networkConnection, chainId);
        this.contract = new Contract(address, SCYBaseABI, networkConnection.provider) as SCYBase;
        this.routerStatic = getRouterStatic(networkConnection.provider, chainId);
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
        const amountScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.deposit(receiver, baseAssetIn, amountBaseToPull, 0, {
                value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
            });
        return this.contract
            .connect(this.networkConnection.signer!)
            .deposit(receiver, baseAssetIn, amountBaseToPull, calcSlippedDownAmount(amountScyOut, slippage), {
                ...overrides,
                value: isNativeToken(baseAssetIn) ? amountBaseToPull : undefined,
            });
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
        const amountBaseOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeem(receiver, amountScyToPull, baseAssetOut, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeem(receiver, amountScyToPull, baseAssetOut, calcSlippedDownAmount(amountBaseOut, slippage), overrides);
    }

    async userInfo(user: Address, multicall?: Multicall): Promise<UserSCYInfo> {
        return Multicall.wrap(this.routerStatic, multicall).callStatic.getUserSCYInfo(this.address, user);
    }
}
