import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/PendleERC20.sol/PendleERC20.json';
import { type BigNumberish, type ContractTransaction, type Overrides, BigNumber as BN, Contract } from 'ethers';

export class ERC20 {
    readonly contract: PendleERC20;

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.contract = new Contract(address, PendleERC20ABI, networkConnection.provider) as PendleERC20;
    }

    allowance(owner: Address, spender: Address): Promise<BN> {
        return this.contract.callStatic.allowance(owner, spender);
    }

    balanceOf(account: Address): Promise<BN> {
        return this.contract.callStatic.balanceOf(account);
    }

    decimals(): Promise<number> {
        return this.contract.callStatic.decimals();
    }

    name(): Promise<string> {
        return this.contract.callStatic.name();
    }

    symbol(): Promise<string> {
        return this.contract.callStatic.symbol();
    }

    totalSupply(): Promise<BN> {
        return this.contract.callStatic.totalSupply();
    }

    approve(spender: Address, amount: BigNumberish, overrides: Overrides = {}): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).approve(spender, amount, overrides);
    }

    transfer(to: Address, amount: BigNumberish, overrides: Overrides = {}): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).transfer(to, amount, overrides);
    }

    transferFrom(
        from: Address,
        to: Address,
        amount: BigNumberish,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).transferFrom(from, to, amount, overrides);
    }
}
