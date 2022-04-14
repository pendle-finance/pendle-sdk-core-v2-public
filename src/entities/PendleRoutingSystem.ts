import { Address, NetworkConnection } from './types';
import { Contract, ContractTransaction, Overrides } from 'ethers';
import { dummyABI } from '../dummy';
import { PendleRouterCoreUpg, PendleRouterYTUpg } from '@pendle/core-v2/typechain-types';
import { calcSlippedDownAmount } from './helper';
export class PendleRoutingSystem {
    public address: Address;
    public contract: PendleRouterCoreUpg;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleRouterCoreUpg;
    }

    public async addLiquidity(
        recipient: Address,
        market: Address,
        scyDesired: string,
        otDesired: string,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidity(recipient, market, scyDesired, otDesired, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidity(
                recipient,
                market,
                scyDesired,
                otDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                overrides
            );
    }

    // Add additional functions below
}
