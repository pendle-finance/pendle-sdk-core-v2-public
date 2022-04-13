import { Address, NetworkConnection } from "./types";
import { constants, Contract, ContractTransaction, Overrides} from "ethers";
import { dummyABI } from "../dummy";
import { PendleRouterCoreUpg, PendleRouterYTUpg } from "@pendle/core-v2/typechain-types"
import { calcSlippedDownAmount } from "./helper";

const INF = constants.MaxUint256;

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

    public async addLiquidity(recipient: Address, market: Address, scyDesired: string, otDesired: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.addLiquidity(recipient, market, scyDesired, otDesired, 0);
        return this.contract.connect(this.networkConnection.signer!).addLiquidity(recipient, market, scyDesired, otDesired, calcSlippedDownAmount(netLpOut, slippage), overrides);
    }

    public async removeLiquidity(recipient: Address, market: Address, lpToRemove: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netScyOut, netOtOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.removeLiquidity(recipient, market, lpToRemove, 0, 0);
        return this.contract.connect(this.networkConnection.signer!).removeLiquidity(recipient, market, lpToRemove, calcSlippedDownAmount(netScyOut, slippage), calcSlippedDownAmount(netOtOut, slippage), overrides);
    }

    public async swapExactOtForScy(recipient: Address, market: Address, exactOtIn: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netScyOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactOtForScy(recipient, market, exactOtIn, 0);
        return this.contract.connect(this.networkConnection.signer!).swapExactOtForScy(recipient, market, exactOtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    public async swapOtForExactScy(recipient: Address, market: Address, exactScyOut: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netOtIn] = await this.contract.connect(this.networkConnection.signer!).callStatic.swapOtForExactScy(recipient, market, INF, exactScyOut, 0, INF);
        const maxOtIn = calcSlippedDownAmount(netOtIn, slippage);
        return this.contract.connect(this.networkConnection.signer!).swapOtForExactScy(recipient, market, maxOtIn, exactScyOut, 0, maxOtIn, overrides);
    }
    
    public async swapScyForExactOt(recipient: Address, market: Address, exactOtOut: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netScyIn] = await this.contract.connect(this.networkConnection.signer!).callStatic.swapScyForExactOt(recipient, market, exactOtOut, INF);
        return this.contract.connect(this.networkConnection.signer!).swapScyForExactOt(recipient, market, exactOtOut, calcSlippedDownAmount(netScyIn, slippage), overrides);
    }

    public async swapExactScyForOt(recipient: Address, market: Address, exactScyIn: string, slippage: number, overrides?: Overrides): Promise<ContractTransaction>{
        const [netOtOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactScyForOt(recipient, market, exactScyIn, 0, 0, INF);
        const minOtOut = calcSlippedDownAmount(netOtOut, slippage);
        return this.contract.connect(this.networkConnection.signer!).swapExactScyForOt(recipient, market, exactScyIn, minOtOut, minOtOut, INF, overrides);
    }

    
    // Add additional functions below
}
