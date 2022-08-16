import type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import type { Address, NetworkConnection } from './types';
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
import { calcSlippedDownAmount, calcSlippedUpAmount, getContractAddresses } from './helper';
import { Market } from './Market';
import { SCY as SCYEntity } from './SCY';
import { YT as YTEntity } from './YT';

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

    static async kybercall(tokenIn: Address, tokenOut: Address): Promise<BytesLike> {
        if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return [];
        return []; // TODO: Implement this from KyberSwap
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
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercall = await Router.kybercall(tokenIn, tokenMintScy);
            const tokenInParam = { tokenIn, netTokenIn, tokenMintScy, kybercall };
            const netPtOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForPt(
                    receiver,
                    market,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    tokenInParam
                );
            return { netPtOut, tokenInParam };
        });
        const { netPtOut, tokenInParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netPtOut.gt(prev.netPtOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForPt(
                receiver,
                market,
                calcSlippedDownAmount(netPtOut, slippage),
                Router.swapApproxParams(netPtOut, slippage),
                tokenInParam,
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
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercall = await Router.kybercall(tokenIn, tokenMintScy);
            const tokenInParam = { tokenIn, netTokenIn, tokenMintScy, kybercall };
            const netScyOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintScyFromToken(receiver, SCY, Router.MIN_AMOUNT, tokenInParam);
            return { netScyOut, tokenInParam };
        });
        const { netScyOut, tokenInParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netScyOut.gt(prev.netScyOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintScyFromToken(receiver, SCY, calcSlippedDownAmount(netScyOut, slippage), tokenInParam, overrides);
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
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const kybercall = await Router.kybercall(tokenRedeemScy, tokenOut);
            const tokenOutParam = { tokenOut, minTokenOut: Router.MIN_AMOUNT, tokenRedeemScy, kybercall };
            const netTokenOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.redeemScyToToken(receiver, SCY, netScyIn, tokenOutParam);
            return { netTokenOut, tokenOutParam };
        });
        const { netTokenOut, tokenOutParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netTokenOut.gt(prev.netTokenOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemScyToToken(
                receiver,
                SCY,
                netScyIn,
                { ...tokenOutParam, minTokenOut: calcSlippedDownAmount(netTokenOut, slippage) },
                overrides
            );
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
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercall = await Router.kybercall(tokenIn, tokenMintScy);
            const tokenInParam = { tokenIn, netTokenIn, tokenMintScy, kybercall };
            const netPyOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.mintPyFromToken(receiver, YT, Router.MIN_AMOUNT, tokenInParam);
            return { netPyOut, tokenInParam };
        });
        const { netPyOut, tokenInParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netPyOut.gt(prev.netPyOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .mintPyFromToken(receiver, YT, calcSlippedDownAmount(netPyOut, slippage), tokenInParam, overrides);
    }

    async redeemPyToToken(
        receiver: Address,
        YT: Address,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const SCY = await new YTEntity(YT, this.networkConnection, this.chainId).contract.callStatic.SCY();
        const tokenRedeemScyList = await new SCYEntity(
            SCY,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const kybercall = await Router.kybercall(tokenRedeemScy, tokenOut);
            const tokenOutParam = { tokenOut, minTokenOut: Router.MIN_AMOUNT, tokenRedeemScy, kybercall };
            const netTokenOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.redeemPyToToken(receiver, YT, netPyIn, tokenOutParam);
            return { netTokenOut, tokenOutParam };
        });
        const { netTokenOut, tokenOutParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netTokenOut.gt(prev.netTokenOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .redeemPyToToken(
                receiver,
                YT,
                netPyIn,
                { ...tokenOutParam, minTokenOut: calcSlippedDownAmount(netTokenOut, slippage) },
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

    async swapExactPtForToken(
        receiver: Address,
        market: Address,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        overrides: Overrides = {}
    ): Promise<ContractTransaction> {
        const { scy } = await new Market(market, this.networkConnection, this.chainId).getMarketInfo();
        const tokenRedeemScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const kybercall = await Router.kybercall(tokenRedeemScy, tokenOut);
            const tokenOutParam = { tokenOut, minTokenOut: Router.MIN_AMOUNT, tokenRedeemScy, kybercall };
            const netTokenOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactPtForToken(receiver, market, exactPtIn, tokenOutParam);
            return { netTokenOut, tokenOutParam };
        });
        const { netTokenOut, tokenOutParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netTokenOut.gt(prev.netTokenOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactPtForToken(
                receiver,
                market,
                exactPtIn,
                { ...tokenOutParam, minTokenOut: calcSlippedDownAmount(netTokenOut, slippage) },
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
        const possibleOutAmounts = tokenMintScyList.map(async (tokenMintScy) => {
            const kybercall = await Router.kybercall(tokenIn, tokenMintScy);
            const tokenInParam = { tokenIn, netTokenIn, tokenMintScy, kybercall };
            const netYtOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactTokenForYt(
                    receiver,
                    market,
                    Router.MIN_AMOUNT,
                    Router.STATIC_APPROX_PARAMS,
                    tokenInParam
                );
            return { netYtOut, tokenInParam };
        });
        const { netYtOut, tokenInParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netYtOut.gt(prev.netYtOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactTokenForYt(
                receiver,
                market,
                calcSlippedDownAmount(netYtOut, slippage),
                Router.swapApproxParams(netYtOut, slippage),
                tokenInParam,
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
        const tokenRedeemScyList = await new SCYEntity(
            scy,
            this.networkConnection,
            this.chainId
        ).contract.callStatic.getTokensOut();
        const possibleOutAmounts = tokenRedeemScyList.map(async (tokenRedeemScy) => {
            const kybercall = await Router.kybercall(tokenRedeemScy, tokenOut);
            const tokenOutParam = { tokenOut, minTokenOut: Router.MIN_AMOUNT, tokenRedeemScy, kybercall };
            const netTokenOut = await this.contract
                .connect(this.networkConnection.signer!)
                .callStatic.swapExactYtForToken(receiver, market, exactYtIn, tokenOutParam);
            return { netTokenOut, tokenOutParam };
        });
        const { netTokenOut, tokenOutParam } = (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netTokenOut.gt(prev.netTokenOut) ? cur : prev
        );
        return this.contract
            .connect(this.networkConnection.signer!)
            .swapExactYtForToken(
                receiver,
                market,
                exactYtIn,
                { ...tokenOutParam, minTokenOut: calcSlippedDownAmount(netTokenOut, slippage) },
                overrides
            );
    }
}
