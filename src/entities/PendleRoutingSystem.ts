import { Address, NetworkConnection } from "./types";
import { BigNumberish, Contract, ContractTransaction, Overrides} from "ethers";
import { dummyABI } from "../dummy";
import { PendleRouterCoreUpg, PendleRouterYTUpg } from "@pendle/core-v2/typechain-types"
import { calcSlippedDownAmount, calcSlippedUpAmount } from "./helper";
import { INF } from "./constants.ts";

export class PendleRoutingSystem {
    public address: Address;
    public contract: PendleRouterCoreUpg;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as ( PendleRouterCoreUpg);
    }

    public async addLiquidity(recipient: Address, market: Address, scyDesired: BigNumberish, otDesired: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.addLiquidity(recipient, market, scyDesired, otDesired, 0);
        return this.contract.connect(this.networkConnection.signer!).addLiquidity(recipient, market, scyDesired, otDesired, calcSlippedDownAmount(netLpOut, slippage), overrides);
    }

    public async removeLiquidity(recipient: Address, market: Address, lpToRemove: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netScyOut, netOtOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.removeLiquidity(recipient, market, lpToRemove, 0, 0);
        return this.contract.connect(this.networkConnection.signer!).removeLiquidity(recipient, market, lpToRemove, calcSlippedDownAmount(netScyOut, slippage), calcSlippedDownAmount(netOtOut, slippage), overrides);
    }

    public async swapExactOtForScy(recipient: Address, market: Address, exactOtIn: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const netScyOut = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactOtForScy(recipient, market, exactOtIn, 0);
        return this.contract.connect(this.networkConnection.signer!).swapExactOtForScy(recipient, market, exactOtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    public async swapOtForExactScy(recipient: Address, market: Address, exactScyOut: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{

    }
    
    public async swapScyForExactOt(recipient: Address, market: Address, exactOtOut: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const netScyIn = await this.contract.connect(this.networkConnection.signer!).callStatic.swapScyForExactOt(recipient, market, exactOtOut, INF);
        return this.contract.connect(this.networkConnection.signer!).swapScyForExactOt(recipient, market, exactOtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    public async swapExactScyForOt(recipient: Address, market: Address, exactScyIn: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{

    }

    
    // Add additional functions below
}
