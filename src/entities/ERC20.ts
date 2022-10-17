import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/erc20/PendleERC20.sol/PendleERC20.json';
import type { BigNumberish, ContractInterface } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { Multicall } from '../multicall';
import { requiresSigner } from './helper';
import { createContractObject, ContractLike, MetaMethodType } from '../contractHelper';

export class ERC20 {
    readonly contract: ContractLike;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = PendleERC20ABI
    ) {
        this.contract = createContractObject(address, abi, networkConnection);
    }

    get ERC20Contract() {
        return this.contract as unknown as ContractLike<PendleERC20>;
    }

    allowance(owner: Address, spender: Address, multicall?: Multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.allowance(owner, spender, multicall);
    }

    balanceOf(account: Address, multicall?: Multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.balanceOf(account, multicall);
    }

    decimals(multicall?: Multicall): Promise<number> {
        return this.ERC20Contract.multicallStatic.decimals(multicall);
    }

    name(multicall?: Multicall): Promise<string> {
        return this.ERC20Contract.multicallStatic.name(multicall);
    }

    symbol(multicall?: Multicall): Promise<string> {
        return this.ERC20Contract.multicallStatic.symbol(multicall);
    }

    totalSupply(multicall?: Multicall): Promise<BN> {
        return this.ERC20Contract.multicallStatic.totalSupply(multicall);
    }

    @requiresSigner
    approve<T extends MetaMethodType = 'send'>(spender: Address, amount: BigNumberish, metaMethodType?: T) {
        return this.ERC20Contract.metaCall.approve(spender, amount, metaMethodType);
    }

    @requiresSigner
    transfer<T extends MetaMethodType = 'send'>(to: Address, amount: BigNumberish, metaMethodType?: T) {
        return this.ERC20Contract.metaCall.transfer(to, amount, metaMethodType);
    }
}
