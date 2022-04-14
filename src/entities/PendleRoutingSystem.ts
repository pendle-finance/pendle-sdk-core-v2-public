import { Address, NetworkConnection } from "./types";
import { BigNumberish, Contract, ContractTransaction, Overrides } from "ethers";
import { dummyABI } from "../dummy";
import { PendleRouterCoreUpg, PendleRouterYTUpg, PendleRouterStaticUpg } from "@pendle/core-v2/typechain-types"
import { calcSlippedDownAmount, calcSlippedUpAmount } from "./helper";
import { INF } from "./constants";
export class PendleRoutingSystem {
    public address: Address;
    public contract: PendleRouterCoreUpg & PendleRouterYTUpg & PendleRouterStaticUpg;
    public chainId: number;

    protected networkConnection: NetworkConnection;
    public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as (PendleRouterCoreUpg & PendleRouterYTUpg & PendleRouterStaticUpg);
    }

    public async addLiquidity(recipient: Address, market: Address, scyDesired: BigNumberish, otDesired: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract.connect(this.networkConnection.signer!).callStatic.addLiquidity(recipient, market, scyDesired, otDesired, 0);
        return this.contract.connect(this.networkConnection.signer!).addLiquidity(recipient, market, scyDesired, otDesired, calcSlippedDownAmount(netLpOut, slippage), overrides);
    }

    // Add additional functions below

    public async mintScyFromRawToken(recipient: Address, SCY: Address, netRawTokenIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netScyOut = await this.contract.connect(this.networkConnection.signer!).callStatic.mintScyFromRawToken(netRawTokenIn, SCY, 0, recipient, path);
        return this.contract.connect(this.networkConnection.signer!).mintScyFromRawToken(netRawTokenIn, SCY, calcSlippedDownAmount(netScyOut, slippage), recipient, path, overrides);
    }

    public async redeemScyToRawToken(recipient: Address, SCY: Address, netScyIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract.connect(this.networkConnection.signer!).callStatic.redeemScyToRawToken(SCY, netScyIn, 0, recipient, path);
        return this.contract.connect(this.networkConnection.signer!).redeemScyToRawToken(SCY, netScyIn, calcSlippedDownAmount(netRawTokenOut, slippage), recipient, path, overrides);
    }

    public async mintYoFromRawToken(recipient: Address, YT: Address, netRawTokenIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netYOAmountOut = await this.contract.connect(this.networkConnection.signer!).callStatic.mintYoFromRawToken(netRawTokenIn, YT, 0, recipient, path);
        return this.contract.connect(this.networkConnection.signer!).mintYoFromRawToken(netRawTokenIn, YT, calcSlippedDownAmount(netYOAmountOut, slippage), recipient, path, overrides);
    }

    public async redeemYoToRawToken(recipient: Address, YT: Address, netYoIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract.connect(this.networkConnection.signer!).callStatic.redeemYoToRawToken(YT, netYoIn, 0, recipient, path);
        return this.contract.connect(this.networkConnection.signer!).redeemYoToRawToken(YT, netYoIn, calcSlippedDownAmount(netRawTokenOut, slippage), recipient, path, overrides);
    }

    public async swapExactRawTokenForOt(recipient: Address, market: Address, exactRawTokenIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {

    }

    public async swapExactOtForRawToken(recipient: Address, market: Address, exactOtIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactOtForRawToken(exactOtIn, recipient, path, market, 0);
        return this.contract.connect(this.networkConnection.signer!).swapExactOtForRawToken(exactOtIn, recipient, path, market, calcSlippedDownAmount(netRawTokenOut, slippage), overrides);
    }

    public async swapExactYtForScy(recipient: Address, market: Address, exactYtIn: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netScyOut = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactYtForScy(recipient, market, exactYtIn, 0);
        return this.contract.connect(this.networkConnection.signer!).swapExactYtForScy(recipient, market, exactYtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    public async swapScyForExactYt(recipient: Address, market: Address, exactYtOut: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netScyIn = await this.contract.connect(this.networkConnection.signer!).callStatic.swapScyForExactYt(recipient, market, exactYtOut, INF);
        return this.contract.connect(this.networkConnection.signer!).swapScyForExactYt(recipient, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    public async swapExactScyForYt(recipient: Address, market: Address, exactScyIn: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {

    }
    
    public async swapYtForExactScy(recipient: Address, market: Address, exactScyOut: BigNumberish, slippage: number, overrides?: Overrides): Promise<ContractTransaction> {

    }

    public async swapExactYtForRawToken(recipient: Address, market: Address, exactYtIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract.connect(this.networkConnection.signer!).callStatic.swapExactYtForRawToken(exactYtIn, recipient, path, market, 0);
        return this.contract.connect(this.networkConnection.signer!).swapExactYtForRawToken(exactYtIn, recipient, path, market, calcSlippedDownAmount(netRawTokenOut, slippage), overrides);
    }

    public async swapExactRawTokenForYt(recipient: Address, market: Address, exactRawTokenIn: BigNumberish, path: Address[], slippage: number, overrides?: Overrides): Promise<ContractTransaction> {
        
    }

} 