import type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection } from './types';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import {
    type BigNumberish,
    type ContractTransaction,
    type Overrides,
    BigNumber as BN,
    Contract,
    constants,
} from 'ethers';
import { calcSlippedDownAmount, calcSlippedUpAmount } from './helper';

export class PendleRoutingSystem {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = constants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: PendleRoutingSystem.MIN_AMOUNT,
        guessMax: PendleRoutingSystem.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 15,
        eps: BN.from(10).pow(15),
    };

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

    static swapApproxParams(netAmountOut: BN, slippage: number): ApproxParamsStruct {
        const MAX_UPSIDE = 0.5;
        return {
            ...PendleRoutingSystem.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(netAmountOut, slippage),
            guessMax: calcSlippedUpAmount(netAmountOut, MAX_UPSIDE),
        };
    }

    async addLiquidity(
        receiver: Address,
        market: Address,
        scyDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidity(receiver, market, scyDesired, ptDesired, PendleRoutingSystem.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .addLiquidity(
                receiver,
                market,
                scyDesired,
                ptDesired,
                calcSlippedDownAmount(netLpOut, slippage),
                overrides
            );
    }

    async removeLiquidity(
        receiver: Address,
        market: Address,
        lpToRemove: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const [netScyOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidity(
                receiver,
                market,
                lpToRemove,
                PendleRoutingSystem.MIN_AMOUNT,
                PendleRoutingSystem.MIN_AMOUNT
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .removeLiquidity(
                receiver,
                market,
                lpToRemove,
                calcSlippedDownAmount(netScyOut, slippage),
                calcSlippedDownAmount(netPtOut, slippage),
                overrides
            );
    }

    async swapExactPtForScy(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForScy(receiver, market, exactPtIn, PendleRoutingSystem.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForScy(receiver, market, exactPtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapPtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netPtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                PendleRoutingSystem.MAX_AMOUNT,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netPtIn, slippage),
                PendleRoutingSystem.swapApproxParams(netPtIn, slippage),
                overrides
            );
    }

    async swapScyForExactPt(
        receiver: Address,
        market: Address,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactPt(receiver, market, exactPtOut, PendleRoutingSystem.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactPt(receiver, market, exactPtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactRawTokenForPt(
        receiver: Address,
        market: Address,
        exactRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactRawTokenForPt(
                receiver,
                market,
                exactRawTokenIn,
                PendleRoutingSystem.MIN_AMOUNT,
                path,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactRawTokenForPt(
                receiver,
                market,
                exactRawTokenIn,
                calcSlippedDownAmount(netPtOut, slippage),
                path,
                PendleRoutingSystem.swapApproxParams(netPtOut, slippage),
                overrides
            );
    }
    async swapExactScyForPt(
        receiver: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForPt(
                receiver,
                market,
                exactScyIn,
                PendleRoutingSystem.MIN_AMOUNT,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForPt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netPtOut, slippage),
                PendleRoutingSystem.swapApproxParams(netPtOut, slippage),
                overrides
            );
    }

    async mintScyFromRawToken(
        receiver: Address,
        SCY: Address,
        netRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintScyFromRawToken(receiver, SCY, netRawTokenIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromRawToken(
                receiver,
                SCY,
                netRawTokenIn,
                calcSlippedDownAmount(netScyOut, slippage),
                path,
                overrides
            );
    }

    async redeemScyToRawToken(
        receiver: Address,
        SCY: Address,
        netScyIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemScyToRawToken(receiver, SCY, netScyIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToRawToken(
                receiver,
                SCY,
                netScyIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                path,
                overrides
            );
    }

    async mintPyFromRawToken(
        receiver: Address,
        YT: Address,
        netRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netPyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintPyFromRawToken(receiver, YT, netRawTokenIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromRawToken(
                receiver,
                YT,
                netRawTokenIn,
                calcSlippedDownAmount(netPyOut, slippage),
                path,
                overrides
            );
    }

    async redeemPyToRawToken(
        receiver: Address,
        YT: Address,
        netPyIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemPyToRawToken(receiver, YT, netPyIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToRawToken(
                receiver,
                YT,
                netPyIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                path,
                overrides
            );
    }

    async swapExactScyForYt(
        receiver: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForYt(
                receiver,
                market,
                exactScyIn,
                PendleRoutingSystem.MIN_AMOUNT,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForYt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netYtOut, slippage),
                PendleRoutingSystem.swapApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapYtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netYtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                PendleRoutingSystem.MAX_AMOUNT,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netYtIn, slippage),
                PendleRoutingSystem.swapApproxParams(netYtIn, slippage),
                overrides
            );
    }

    async swapExactPtForRawToken(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForRawToken(receiver, market, exactPtIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForRawToken(
                receiver,
                market,
                exactPtIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                path,
                overrides
            );
    }

    async swapExactYtForScy(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForScy(receiver, market, exactYtIn, 0);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForScy(receiver, market, exactYtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapScyForExactYt(
        receiver: Address,
        market: Address,
        exactYtOut: BigNumberish,
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactYt(receiver, market, exactYtOut, PendleRoutingSystem.MAX_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactYt(receiver, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactRawTokenForYt(
        receiver: Address,
        market: Address,
        exactRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactRawTokenForYt(
                receiver,
                market,
                exactRawTokenIn,
                PendleRoutingSystem.MIN_AMOUNT,
                path,
                PendleRoutingSystem.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactRawTokenForYt(
                receiver,
                market,
                exactRawTokenIn,
                calcSlippedDownAmount(netYtOut, slippage),
                path,
                PendleRoutingSystem.swapApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapExactYtForRawToken(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides?: Overrides
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForRawToken(receiver, market, exactYtIn, PendleRoutingSystem.MIN_AMOUNT, path);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForRawToken(
                receiver,
                market,
                exactYtIn,
                calcSlippedDownAmount(netRawTokenOut, slippage),
                path,
                overrides
            );
    }
}
