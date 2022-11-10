import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import {
    PendleERC20,
    PendleERC20ABI,
    MetaMethodType,
    WrappedContract,
    MetaMethodExtraParams,
    MulticallStaticParams,
} from '../contracts';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { Address, ChainId } from '../common';

export type ERC20Config = PendleEntityConfigOptionalAbi;

export class ERC20 extends PendleEntity {
    constructor(readonly address: Address, readonly chainId: ChainId, config: ERC20Config) {
        super(address, chainId, { abi: PendleERC20ABI, ...config });
    }

    get contract(): WrappedContract<PendleERC20> {
        return this._contract as WrappedContract<PendleERC20>;
    }

    allowance(owner: Address, spender: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.allowance(owner, spender, params);
    }

    balanceOf(account: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.balanceOf(account, params);
    }

    decimals(params?: MulticallStaticParams): Promise<number> {
        return this.contract.multicallStatic.decimals(params);
    }

    name(params?: MulticallStaticParams): Promise<string> {
        return this.contract.multicallStatic.name(params);
    }

    symbol(params?: MulticallStaticParams): Promise<string> {
        return this.contract.multicallStatic.symbol(params);
    }

    totalSupply(params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.totalSupply(params);
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
