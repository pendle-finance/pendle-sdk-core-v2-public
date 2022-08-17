import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection } from './types';
import axios from 'axios';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import {
    type BigNumberish,
    type BytesLike,
    type ContractTransaction,
    type Overrides,
    BigNumber as BN,
    constants,
    Contract,
} from 'ethers';
import { KYBER_API } from '../constants';
import { calcSlippedDownAmount, calcSlippedUpAmount, getContractAddresses } from './helper';
import { Market } from './Market';
import { SCY as SCYEntity } from './SCY';
import { YT as YTEntity } from './YT';

export type KybercallData = {
    amountInUsd?: number;
    amountOutUsd?: number;
    outputAmount: BigNumberish;
    encodedSwapData: BytesLike;
};

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

    constructor(
        readonly address: Address,
        protected readonly networkConnection: NetworkConnection,
        readonly chainId: number
    ) {
        this.contract = new Contract(address, IPAllActionABI, networkConnection.provider) as IPAllAction;
    }

    static getRouter(networkConnection: NetworkConnection, chainId: number): Router {
        return new Router(getContractAddresses(chainId).ROUTER, networkConnection, chainId);
    }

    static swapApproxParams(netAmountOut: BN, slippage: number): ApproxParamsStruct {
        const MAX_UPSIDE = 0.5;
        return {
            ...Router.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(netAmountOut, slippage),
            guessMax: calcSlippedUpAmount(netAmountOut, MAX_UPSIDE),
        };
    }

    async kybercall(tokenIn: Address, tokenOut: Address, amountIn: BigNumberish): Promise<KybercallData> {
        if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return { outputAmount: amountIn, encodedSwapData: [] };
        const { data } = await axios.get(KYBER_API[this.chainId], {
            params: { tokenIn, tokenOut, amountIn: BN.from(amountIn).toString(), to: this.contract.address },
            headers: { 'Accept-Version': 'Latest' },
        });
        return data;
    }

    async inputParams(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintScyList: Address[],
        fn: (input: TokenInputStruct) => Promise<BN>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
    }> {
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercallData = await this.kybercall(tokenIn, tokenMintScy, netTokenIn);
            const input = {
                tokenIn,
                netTokenIn,
                tokenMintScy,
                kybercall: kybercallData.encodedSwapData,
            } as TokenInputStruct;

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: BN.from(-1), input, kybercallData };
            }

            const netOut = await fn(input);
            return { netOut, input, kybercallData };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async outputParams(
        SCY: Address,
        netScyIn: BigNumberish,
        tokenOut: Address,
        tokenRedeemScyList: Address[],
        fn: (output: TokenOutputStruct) => Promise<BN>,
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
    }> {
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const amountIn = await new SCYEntity(
                SCY,
                this.networkConnection,
                this.chainId
            ).contract.callStatic.previewRedeem(tokenRedeemScy, netScyIn);
            const kybercallData = await this.kybercall(tokenRedeemScy, tokenOut, amountIn);
            const output = {
                tokenOut,
                tokenRedeemScy,
                kybercall: kybercallData.encodedSwapData,
                minTokenOut: Router.MIN_AMOUNT,
            } as TokenOutputStruct;

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: BN.from(-1), output, kybercallData };
            }

            const netOut = await fn(output);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
            };
        });
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
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

    async swapExactTokenForPt(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenMintScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForPt(receiver, market, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS, input)
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForPt(
                receiver,
                market,
                calcSlippedDownAmount(netOut, slippage),
                Router.swapApproxParams(netOut, slippage),
                input,
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

    async mintScyFromToken(
        receiver: Address,
        SCY: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const tokenMintScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintScyFromToken(receiver, SCY, Router.MIN_AMOUNT, input)
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromToken(receiver, SCY, calcSlippedDownAmount(netOut, slippage), input, overrides);
    }

    async redeemScyToToken(
        receiver: Address,
        SCY: Address,
        netScyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const tokenRedeemScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const { output } = await this.outputParams(
            SCY,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemScyToToken(receiver, SCY, netScyIn, output),
            slippage
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToToken(receiver, SCY, netScyIn, output, overrides);
    }

    async mintPyFromToken(
        receiver: Address,
        YT: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const SCY = await new YTEntity(YT, this.networkConnection, this.chainId).contract.callStatic.SCY();
        const tokenMintScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintPyFromToken(receiver, YT, Router.MIN_AMOUNT, input)
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromToken(receiver, YT, calcSlippedDownAmount(netOut, slippage), input, overrides);
    }

    async redeemPyToToken(
        receiver: Address,
        YT: Address,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const ytStatic = new YTEntity(YT, this.networkConnection, this.chainId).contract.callStatic;
        const [SCY, pyIndex] = await Promise.all([ytStatic.SCY(), ytStatic.pyIndexCurrent()]);
        const tokenRedeemScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const { output } = await this.outputParams(
            SCY,
            BN.from(netPyIn).mul(constants.WeiPerEther).div(pyIndex),
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.redeemPyToToken(receiver, YT, netPyIn, output),
            slippage
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToToken(receiver, YT, netPyIn, output, overrides);
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

    async swapExactPtForToken(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const [tokenRedeemScyList, netScyIn] = await Promise.all([
            new SCYEntity(scy, this.networkConnection, this.chainId).contract.callStatic.getTokensOut(),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactPtForScy(receiver, market, exactPtIn, Router.MIN_AMOUNT),
        ]);
        const { output } = await this.outputParams(
            scy,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactPtForToken(receiver, market, exactPtIn, output),
            slippage
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForToken(receiver, market, exactPtIn, output, overrides);
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
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapScyForExactYt(receiver, market, exactYtOut, calcSlippedUpAmount(netScyIn, slippage), overrides);
    }

    async swapExactTokenForYt(
        receiver: Address,
        market: Address,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenMintScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensIn();
        const { netOut, input } = await this.inputParams(tokenIn, netTokenIn, tokenMintScyList, (input) =>
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForYt(receiver, market, Router.MIN_AMOUNT, Router.STATIC_APPROX_PARAMS, input)
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForYt(
                receiver,
                market,
                calcSlippedDownAmount(netOut, slippage),
                Router.swapApproxParams(netOut, slippage),
                input,
                overrides
            );
    }

    async swapExactYtForToken(
        receiver: Address,
        market: Address,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const [tokenRedeemScyList, netScyIn] = await Promise.all([
            new SCYEntity(scy, this.networkConnection, this.chainId).contract.callStatic.getTokensOut(),
            this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactYtForScy(receiver, market, exactYtIn, Router.MIN_AMOUNT),
        ]);
        const { output } = await this.outputParams(
            scy,
            netScyIn,
            tokenOut,
            tokenRedeemScyList,
            (output) =>
                this.contract
                    .connect(this.networkConnection.signer!)
                    .callStatic.swapExactYtForToken(receiver, market, exactYtIn, output),
            slippage
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForToken(receiver, market, exactYtIn, output, overrides);
    }
}
