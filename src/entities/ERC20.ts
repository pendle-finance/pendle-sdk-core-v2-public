import type { PendleERC20 } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as PendleERC20ABI } from '@pendle/core-v2/build/artifacts/contracts/core/PendleERC20.sol/PendleERC20.json';
import { BigNumberish, Contract, ContractTransaction, Overrides, Signer } from 'ethers';

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

    async approve(
        spender: Address,
        amount: BigNumberish
    ): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).approve(spender, amount);
    }

    async transfer(
        to: Address,
        amount: BigNumberish
    ): Promise<ContractTransaction> {
        return this.contract.connect(this.networkConnection.signer!).transfer(to,amount);
    }
}
