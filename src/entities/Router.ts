import type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection } from './types';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import {
    BigNumber as BN,
    type BigNumberish,
    constants,
    Contract,
    type ContractTransaction,
    type Overrides,
} from 'ethers';
import { calcSlippedDownAmount, calcSlippedUpAmount, getContractAddresses } from './helper';

export class Router {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = constants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: Router.MIN_AMOUNT,
        guessMax: Router.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 256,
        eps: BN.from(10).pow(15),
    };
    readonly contract: IPAllAction;

    constructor(readonly address: Address, protected readonly networkConnection: NetworkConnection) {
        this.contract = new Contract(address, IPAllActionABI, networkConnection.provider) as IPAllAction;
    }

    static getRouter(networkConnection: NetworkConnection, chainId: number): Router {
        return new Router(getContractAddresses(chainId).ROUTER, networkConnection);
    }

    static swapApproxParams(netAmountOut: BN, slippage: number): ApproxParamsStruct {
        const MAX_UPSIDE = 0.5;
        return {
            ...Router.STATIC_APPROX_PARAMS,
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netLpOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.addLiquidity(receiver, market, scyDesired, ptDesired, Router.MIN_AMOUNT);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const [netScyOut, netPtOut] = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.removeLiquidity(receiver, market, lpToRemove, Router.MIN_AMOUNT, Router.MIN_AMOUNT);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForScy(receiver, market, exactPtIn, Router.MIN_AMOUNT);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForScy(receiver, market, exactPtIn, calcSlippedDownAmount(netScyOut, slippage), overrides);
    }

    async swapPtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapPtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netPtIn, slippage),
                Router.swapApproxParams(netPtIn, slippage),
                overrides
            );
    }

    async swapScyForExactPt(
        receiver: Address,
        market: Address,
        exactPtOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactPt(receiver, market, exactPtOut, Router.MAX_AMOUNT);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactRawTokenForPt(
                receiver,
                market,
                exactRawTokenIn,
                Router.MIN_AMOUNT,
                path,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactRawTokenForPt(
                receiver,
                market,
                exactRawTokenIn,
                calcSlippedDownAmount(netPtOut, slippage),
                path,
                Router.swapApproxParams(netPtOut, slippage),
                overrides
            );
    }
    async swapExactScyForPt(
        receiver: Address,
        market: Address,
        exactScyIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForPt(receiver, market, exactScyIn, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForPt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.swapApproxParams(netPtOut, slippage),
                overrides
            );
    }

    async mintScyFromRawToken(
        receiver: Address,
        SCY: Address,
        netRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintScyFromRawToken(receiver, SCY, netRawTokenIn, Router.MIN_AMOUNT, path);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemScyToRawToken(receiver, SCY, netScyIn, Router.MIN_AMOUNT, path);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netPyOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.mintPyFromRawToken(receiver, YT, netRawTokenIn, Router.MIN_AMOUNT, path);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.redeemPyToRawToken(receiver, YT, netPyIn, Router.MIN_AMOUNT, path);
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactScyForYt(receiver, market, exactScyIn, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS);
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactScyForYt(
                receiver,
                market,
                exactScyIn,
                calcSlippedDownAmount(netYtOut, slippage),
                Router.swapApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapYtForExactScy(
        receiver: Address,
        market: Address,
        exactScyOut: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netYtIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                Router.MAX_AMOUNT,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapYtForExactScy(
                receiver,
                market,
                exactScyOut,
                calcSlippedUpAmount(netYtIn, slippage),
                Router.swapApproxParams(netYtIn, slippage),
                overrides
            );
    }

    async swapExactPtForRawToken(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactPtForRawToken(receiver, market, exactPtIn, Router.MIN_AMOUNT, path);
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
        overrides: Overrides = {}
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
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netScyIn = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapScyForExactYt(receiver, market, exactYtOut, Router.MAX_AMOUNT);
        if (overrides) {
            return this.contract
                .connect(this.networkConnection.signer!)
                .swapScyForExactYt(receiver, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
        } else {
            return this.contract
                .connect(this.networkConnection.signer!)
                .swapScyForExactYt(receiver, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage));
        }
    }

    async swapExactRawTokenForYt(
        receiver: Address,
        market: Address,
        exactRawTokenIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netYtOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactRawTokenForYt(
                receiver,
                market,
                exactRawTokenIn,
                Router.MIN_AMOUNT,
                path,
                Router.STATIC_APPROX_PARAMS
            );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactRawTokenForYt(
                receiver,
                market,
                exactRawTokenIn,
                calcSlippedDownAmount(netYtOut, slippage),
                path,
                Router.swapApproxParams(netYtOut, slippage),
                overrides
            );
    }

    async swapExactYtForRawToken(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        path: Address[],
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const netRawTokenOut = await this.contract
            .connect(this.networkConnection.signer!)
            .callStatic.swapExactYtForRawToken(receiver, market, exactYtIn, Router.MIN_AMOUNT, path);
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
