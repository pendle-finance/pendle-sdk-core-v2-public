import type { IPAllAction } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import { type BigNumberish, type ContractTransaction, type Overrides, Contract, constants } from 'ethers';
import { calcSlippedDownAmount, calcSlippedUpAmount } from './helper';

export class PendleRoutingSystem {
    address: Address;
    contract: IPAllAction;
    chainId: number;

    protected networkConnection: NetworkConnection;

    constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
        this.address = _address;
        this.networkConnection = _networkConnection;
        this.chainId = _chainId;
        this.contract = new Contract(_address, IPAllActionABI, _networkConnection.provider) as IPAllAction;
    }

    async addLiquidity(
        recipient: Address,
        market: Address,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidity(recipient, market, scyDesired, ptDesired, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidity(
                recipient,
                market,
                scyDesired,
                ptDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                overrides
            );
    }

    async removeLiquidity(
        recipient: Address,
        market: Address,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const [netScyOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidity(recipient, market, lpToRemove, 0, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidity(
                recipient,
                market,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async swapExactPtForScy(
        recipient: Address,
        market: Address,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForScy(recipient, market, exactPtIn, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForScy(recipient, market, exactPtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapPtForExactScy(
        recipient: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    async swapScyForExactPt(
        recipient: Address,
        market: Address,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactPt(recipient, market, exactPtOut, constants.MaxUint256);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactPt(recipient, market, exactPtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactRawTokenForPt(
        recipient: Address,
        market: Address,
        exactRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }
    async swapExactScyForPt(
        recipient: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    async mintScyFromRawToken(
        recipient: Address,
        SCY: Address,
        netRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintScyFromRawToken(netRawTokenIn, SCY, 0, recipient, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromRawToken(
                netRawTokenIn,
                SCY,
                calcSlippedDownAmount(netScyOut, slippage),
                recipient,
                path,
                overrides
            );
    }

    async redeemScyToRawToken(
        recipient: Address,
        SCY: Address,
        netScyIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemScyToRawToken(SCY, netScyIn, 0, recipient, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToRawToken(
                SCY,
                netScyIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                recipient,
                path,
                overrides
            );
    }

    async mintPyFromRawToken(
        recipient: Address,
        YT: Address,
        netRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netPYAmountOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintPyFromRawToken(netRawTokenIn, YT, 0, recipient, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromRawToken(
                netRawTokenIn,
                YT,
                calcSlippedDownAmount(netPYAmountOut, slippage),
                recipient,
                path,
                overrides
            );
    }

    async redeemPyToRawToken(
        recipient: Address,
        YT: Address,
        netPyIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemPyToRawToken(YT, netPyIn, 0, recipient, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToRawToken(
                YT,
                netPyIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                recipient,
                path,
                overrides
            );
    }

    async swapExactScyForYt(
        recipient: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    async swapYtForExactScy(
        recipient: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    async swapExactPtForRawToken(
        recipient: Address,
        market: Address,
        exactPtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForRawToken(exactPtIn, recipient, path, market, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForRawToken(
                exactPtIn,
                recipient,
                path,
                market,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                overrides
            );
    }

    async swapExactYtForScy(
        recipient: Address,
        market: Address,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForScy(recipient, market, exactYtIn, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForScy(recipient, market, exactYtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapScyForExactYt(
        recipient: Address,
        market: Address,
        exactYtOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactYt(recipient, market, exactYtOut, constants.MaxUint256);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactYt(recipient, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactRawTokenForYt(
        recipient: Address,
        market: Address,
        exactRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        return {} as ContractTransaction;
    }

    async swapExactYtForRawToken(
        recipient: Address,
        market: Address,
        exactYtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForRawToken(exactYtIn, recipient, path, market, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForRawToken(
                exactYtIn,
                recipient,
                path,
                market,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                overrides
            );
    }
}
