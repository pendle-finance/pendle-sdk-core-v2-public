import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, ChainId } from '../types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/PendleERC20.sol/PendleERC20.json';
import type { BigNumberish, ContractTransaction, Overrides, ContractInterface } from 'ethers';
import { BigNumber as BN, Contract } from 'ethers';
import { Multicall } from '../multicall';
import { createContractObject, requiresSigner } from './helper';

export class ERC20 {
    readonly contract: Contract;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: ChainId,
        abi: ContractInterface = PendleERC20ABI
    ) {
        this.contract = createContractObject(address, abi, networkConnection);
    }

    get ERC20Contract() {
        return this.contract as PendleERC20;
    }

    allowance(owner: Address, spender: Address, multicall?: Multicall): Promise<BN> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.allowance(owner, spender);
    }

    balanceOf(account: Address, multicall?: Multicall): Promise<BN> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.balanceOf(account);
    }

    decimals(multicall?: Multicall): Promise<number> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.decimals();
    }

    name(multicall?: Multicall): Promise<string> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.name();
    }

    symbol(multicall?: Multicall): Promise<string> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.symbol();
    }

    totalSupply(multicall?: Multicall): Promise<BN> {
        return Multicall.wrap(this.ERC20Contract, multicall).callStatic.totalSupply();
    }

    @requiresSigner
    approve(spender: Address, amount: BigNumberish, overrides: Overrides = {}): Promise<ContractTransaction> {
        return this.ERC20Contract.approve(spender, amount, overrides);
    }

    @requiresSigner
    transfer(to: Address, amount: BigNumberish, overrides: Overrides = {}): Promise<ContractTransaction> {
        return this.ERC20Contract.transfer(to, amount, overrides);
    }
}
