import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/PendleERC20.sol/PendleERC20.json';
import { BigNumber, BigNumberish, Contract, ContractTransaction, Overrides } from 'ethers';

export class ERC20 {
    address: Address;
    contract: PendleERC20;
    chainId: number;

    protected networkConnection: NetworkConnection;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, PendleERC20ABI, _networkConnection.provider) as PendleERC20;
    }

    async balanceOf(account: Address): Promise<BigNumber> {
        return this.contract.balanceOf(account);
    }

    async allowance(owner: Address, spender: Address): Promise<BigNumber> {
        return this.contract.allowance(owner, spender);
    }

    async approve(spender: Address, amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction> {
        if (overrides) {
            return this.contract.connect(this.networkConnection.signer!).approve(spender, amount, overrides);
        } else {
            return this.contract.connect(this.networkConnection.signer!).approve(spender, amount);
        }
    }

    async transfer(to: Address, amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction> {
        if (overrides) {
            return this.contract.connect(this.networkConnection.signer!).transfer(to, amount, overrides);
        } else {
            return this.contract.connect(this.networkConnection.signer!).transfer(to, amount);
        }
    }
}
