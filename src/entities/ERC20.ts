import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/erc20/PendleERC20.sol/PendleERC20.json';
import type { BigNumberish, ContractInterface } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { Multicall } from '../multicall';
import { createContractObject, WrappedContract, MetaMethodType } from '../contractHelper';

export type ERC20Config = {
    multicall?: Multicall;
    abi?: ContractInterface;
};

export class ERC20 {
    readonly contract: WrappedContract;
    readonly multicall?: Multicall;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        config: ERC20Config = {}
    ) {
        this.multicall = config.multicall;
        const abi = config.abi ?? PendleERC20ABI;
        this.contract = createContractObject(address, abi, networkConnection, { multicall: this.multicall });
    }

    get ERC20Contract() {
        return this.contract as WrappedContract<PendleERC20>;
    }

    allowance(owner: Address, spender: Address, multicall = this.multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.allowance(owner, spender, multicall);
    }

    balanceOf(account: Address, multicall = this.multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.balanceOf(account, multicall);
    }

    decimals(multicall = this.multicall): Promise<number> {
        return this.ERC20Contract.multicallStatic.decimals(multicall);
    }

    name(multicall = this.multicall): Promise<string> {
        return this.ERC20Contract.multicallStatic.name(multicall);
    }

    symbol(multicall = this.multicall): Promise<string> {
        return this.ERC20Contract.multicallStatic.symbol(multicall);
    }

    totalSupply(multicall = this.multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.totalSupply(multicall);
    }

    async approve<T extends MetaMethodType = 'send'>(spender: Address, amount: BigNumberish, metaMethodType?: T) {
        return this.ERC20Contract.metaCall.approve(spender, amount, metaMethodType);
    }

    async transfer<T extends MetaMethodType = 'send'>(to: Address, amount: BigNumberish, metaMethodType?: T) {
        return this.ERC20Contract.metaCall.transfer(to, amount, metaMethodType);
    }
}
