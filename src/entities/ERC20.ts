import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleERC20, PendleERC20ABI, MetaMethodType, WrappedContract, MetaMethodExtraParams } from '../contracts';
import type { Address, ChainId } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';

export type ERC20Config = PendleEntityConfigOptionalAbi;

export class ERC20<C extends WrappedContract<PendleERC20> = WrappedContract<PendleERC20>> extends PendleEntity<C> {
    constructor(readonly address: Address, readonly chainId: ChainId, config: ERC20Config) {
        super(address, chainId, { abi: PendleERC20ABI, ...config });
    }

    allowance(owner: Address, spender: Address, multicall = this.multicall): Promise<BN> {
        return this.contract.multicallStatic.allowance(owner, spender, multicall);
    }

    balanceOf(account: Address, multicall = this.multicall): Promise<BN> {
        return this.contract.multicallStatic.balanceOf(account, multicall);
    }

    decimals(multicall = this.multicall): Promise<number> {
        return this.contract.multicallStatic.decimals(multicall);
    }

    name(multicall = this.multicall): Promise<string> {
        return this.contract.multicallStatic.name(multicall);
    }

    symbol(multicall = this.multicall): Promise<string> {
        return this.contract.multicallStatic.symbol(multicall);
    }

    totalSupply(multicall = this.multicall): Promise<BN> {
        return this.contract.multicallStatic.totalSupply(multicall);
    }

    async approve<T extends MetaMethodType>(
        spender: Address,
        amount: BigNumberish,
        params: MetaMethodExtraParams<T> = {}
    ) {
        return this.contract.metaCall.approve(spender, amount, this.addExtraParams(params));
    }

    async transfer<T extends MetaMethodType = 'send'>(
        to: Address,
        amount: BigNumberish,
        params: MetaMethodExtraParams<T> = {}
    ) {
        return this.contract.metaCall.transfer(to, amount, this.addExtraParams(params));
    }
}
