import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import {
    RouterStatic,
    WrappedContract,
    MetaMethodType,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
} from '../contracts';
import type {
    ApproxParamsStruct,
    IPAllAction,
    TokenInputStruct,
    TokenOutputStruct,
} from '@pendle/core-v2/typechain-types/IPAllAction';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { Address, NetworkConnection, ChainId, RawTokenAmount } from '../types';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants } from 'ethers';
import { getContractAddresses, getRouterStatic, isNativeToken } from './helper';
import { calcSlippedDownAmount, calcSlippedUpAmount, PyIndex } from './math';
import { MarketEntity } from './MarketEntity';
import { SyEntity } from './SyEntity';
import { YtEntity } from './YtEntity';
import { NoRouteFoundError } from '../errors';
import { KyberHelper, KybercallData, KyberState, KyberHelperCoreConfig } from './KyberHelper';

export type RouterState = {
    kyberHelper: KyberState;
};

export type RouterConfig = PendleEntityConfigOptionalAbi & {
    kyberHelper?: KyberHelperCoreConfig;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllAction>,
    Data extends {}
> = MetaMethodReturnType<T, IPAllAction, M, Data>;

export class Router<C extends WrappedContract<IPAllAction> = WrappedContract<IPAllAction>> extends PendleEntity<C> {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: Router.MIN_AMOUNT,
        guessMax: Router.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 256,
        eps: BN.from(10).pow(15),
    };
    readonly routerStatic: WrappedContract<RouterStatic>;
    readonly kyberHelper: KyberHelper;

    constructor(readonly address: Address, readonly chainId: ChainId, config: RouterConfig) {
        super(address, chainId, { abi: IPAllActionABI, ...config });
        const { kyberHelper: kyberHelperCoreConfig } = { ...config };
        this.routerStatic = getRouterStatic(chainId, config);

        this.kyberHelper = new KyberHelper(address, chainId, {
            ...this.networkConnection,
            ...kyberHelperCoreConfig,
        });
    }

    protected get routerStaticCall() {
        return this.routerStatic.multicallStatic;
    }

    get state(): RouterState {
        return {
            kyberHelper: this.kyberHelper.state,
        };
    }

    set state(value: RouterState) {
        this.kyberHelper.state = value.kyberHelper;
    }

    static getRouter(chainId: ChainId, networkConnection: NetworkConnection): Router {
        return new Router(getContractAddresses(chainId).ROUTER, chainId, networkConnection);
    }

    static guessOutApproxParams(guessAmountOut: BN, slippage: number): ApproxParamsStruct {
        return {
            ...Router.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountOut, 2 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountOut, 10 * slippage),
            guessOffchain: guessAmountOut,
        };
    }

    static guessInApproxParams(guessAmountIn: BN, slippage: number): ApproxParamsStruct {
        return {
            ...Router.STATIC_APPROX_PARAMS,
            guessMin: calcSlippedDownAmount(guessAmountIn, 10 * slippage),
            guessMax: calcSlippedUpAmount(guessAmountIn, 2 * slippage),
            guessOffchain: guessAmountIn,
        };
    }

    async inputParams(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintSyList: Address[],
        fn: (tokenAmount: RawTokenAmount<BigNumberish>) => Promise<{ netOut: BN; netSyFee: BN }>
    ): Promise<{
        netOut: BN;
        input: TokenInputStruct;
        kybercallData: KybercallData;
        netSyFee: BN;
    }> {
        const processTokenMinSy = async (tokenMintSy: Address) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintSy);
            const input: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, input, kybercallData, netSyFee: etherConstants.Zero };
            }

            const { netOut, netSyFee } = await fn({ token: tokenMintSy, amount: kybercallData.outputAmount }).catch(
                (_) => ({ netOut: etherConstants.NegativeOne, netSyFee: etherConstants.Zero })
            );

            return { netOut, netSyFee, input, kybercallData };
        };
        if (tokenMintSyList.includes(tokenIn)) {
            return processTokenMinSy(tokenIn);
        }
        const possibleOutAmounts = tokenMintSyList.map(processTokenMinSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    // TODO: find a way to avoid this duplication
    async zapInputParams<T extends { netLpOut: BN; netPtFromSwap: BN }>(
        tokenIn: Address,
        netTokenIn: BigNumberish,
        tokenMintSyList: Address[],
        fn: (input: TokenInputStruct, tokenAmount: BN) => Promise<T>
    ): Promise<{
        netLpOut: BN;
        netPtFromSwap: BN;
        zapInInput: TokenInputStruct;
        kybercallData: KybercallData;
    }> {
        const processTokenMinSy = async (tokenMintSy: Address) => {
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenIn, amount: netTokenIn }, tokenMintSy);
            const zapInInput: TokenInputStruct = {
                tokenIn,
                netTokenIn,
                tokenMintSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return {
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.NegativeOne,
                    zapInInput,
                    kybercallData,
                };
            }

            const { netLpOut, netPtFromSwap } = await fn(zapInInput, BN.from(kybercallData.outputAmount)).catch(
                (_) => ({
                    netLpOut: etherConstants.NegativeOne,
                    netPtFromSwap: etherConstants.Zero,
                })
            );
            return { netLpOut, netPtFromSwap, zapInInput, kybercallData };
        };
        if (tokenMintSyList.includes(tokenIn)) {
            return processTokenMinSy(tokenIn);
        }
        const possibleOutAmounts = tokenMintSyList.map(processTokenMinSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) =>
            cur.netLpOut.gt(prev.netLpOut) ? cur : prev
        );
    }

    async outputParams(
        sy: Address,
        netSyIn: BigNumberish,
        tokenOut: Address,
        tokenRedeemSyList: Address[],
        slippage: number = 0
    ): Promise<{
        netOut: BN;
        output: TokenOutputStruct;
        kybercallData: KybercallData;
    }> {
        const processTokenRedeemSy = async (tokenRedeemSy: Address) => {
            const amountIn = await new SyEntity(sy, this.chainId, this.networkConnection).previewRedeem(
                tokenRedeemSy,
                netSyIn
            );
            const kybercallData = await this.kyberHelper.makeCall({ token: tokenRedeemSy, amount: amountIn }, tokenOut);
            const output: TokenOutputStruct = {
                tokenOut,
                tokenRedeemSy,
                kybercall: kybercallData.encodedSwapData ?? '0x',
                minTokenOut: Router.MIN_AMOUNT,
            };

            // return -1 to avoid swapping through this token
            if (kybercallData.encodedSwapData === undefined) {
                return { netOut: etherConstants.NegativeOne, output, kybercallData, netSyFee: etherConstants.Zero };
            }

            const netOut = BN.from(kybercallData.outputAmount);
            return {
                netOut,
                output: { ...output, minTokenOut: calcSlippedDownAmount(netOut, slippage) },
                kybercallData,
            };
        };
        if (tokenRedeemSyList.includes(tokenOut)) {
            return processTokenRedeemSy(tokenOut);
        }
        const possibleOutAmounts = tokenRedeemSyList.map(processTokenRedeemSy);
        return (await Promise.all(possibleOutAmounts)).reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualSyAndPt<T extends MetaMethodType = 'send'>(
        market: Address | MarketEntity,
        syDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualSyAndPt', { netLpOut: BN; netSyUsed: BN; netPtUsed: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquidityDualSyAndPtStatic(marketAddr, syDesired, ptDesired);
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            syDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            metaMethodType,
            res
        );
    }

    async addLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualTokenAndPt', { netLpOut: BN; netTokenUsed: BN; netPtUsed: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const overrides = {
            value: isNativeToken(tokenIn) ? tokenDesired : undefined,
        };
        const res = await this.routerStaticCall.addLiquidityDualTokenAndPtStatic(
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualTokenAndPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            tokenIn,
            tokenDesired,
            ptDesired,
            calcSlippedDownAmount(netLpOut, slippage),
            metaMethodType,
            { ...res, overrides }
        );
    }

    async addLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySinglePt',
        { netLpOut: BN; netPtToSwap: BN; netSyFee: BN; priceImpact: BN; approxParam: ApproxParamsStruct }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySinglePtStatic(marketAddr, netPtIn);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(netPtToSwap, slippage);
        return this.contract.metaCall.addLiquiditySinglePt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            netPtIn,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async addLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleSy',
        { netLpOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN; approxParam: ApproxParamsStruct }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyStatic(marketAddr, netSyIn);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            netSyIn,
            calcSlippedDownAmount(netLpOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async addLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleToken',
        { netLpOut: BN; netPtFromSwap: BN; zapInInput: TokenInputStruct; kybercallData: KybercallData }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn());

        const res = await this.zapInputParams(tokenIn, netTokenIn, tokenMintSyList, (input, tokenAmount) =>
            this.routerStaticCall.addLiquiditySingleBaseTokenStatic(marketAddr, input.tokenMintSy, tokenAmount)
        );

        const { netLpOut, netPtFromSwap, zapInInput } = res;

        if (netLpOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap in', tokenIn, marketAddr);
        }

        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            calcSlippedDownAmount(netLpOut, slippage),
            approxParam,
            zapInInput,
            metaMethodType,
            {
                ...res,
                overrides: {
                    value: isNativeToken(zapInInput.tokenIn) ? zapInInput.netTokenIn : undefined,
                },
            }
        );
    }

    async removeLiquidityDualSyAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'removeLiquidityDualSyAndPt', { netSyOut: BN; netPtOut: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualSyAndPtStatic(marketAddr, lpToRemove);
        const { netSyOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualSyAndPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'removeLiquidityDualTokenAndPt', { netTokenOut: BN; netPtOut: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualTokenAndPtStatic(marketAddr, lpToRemove, tokenOut);
        const { netTokenOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualTokenAndPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            lpToRemove,
            tokenOut,
            calcSlippedDownAmount(netTokenOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySinglePt',
        { netPtOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySinglePtStatic(marketAddr, lpToRemove);
        const { netPtOut, netPtFromSwap } = res;
        return this.contract.metaCall.removeLiquiditySinglePt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'removeLiquiditySingleSy', { netSyOut: BN; netSyFee: BN; priceImpact: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySingleSyStatic(marketAddr, lpToRemove);
        const { netSyOut } = res;
        return this.contract.metaCall.removeLiquiditySingleSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            metaMethodType,
            res
        );
    }

    async removeLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.routerStaticCall.removeLiquiditySingleSyStatic(marketAddr, lpToRemove),
        ]);

        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { netOut: netTokenOut, output } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        return this.contract.metaCall.removeLiquiditySingleToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            lpToRemove,
            output,
            metaMethodType,
            { ...res, intermediateSy, netSyFee, netTokenOut }
        );
    }

    async swapExactPtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'swapExactPtForSy', { netSyOut: BN; netSyFee: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactPtForSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapPtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapPtForExactSy',
        { netPtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapPtForExactSyStatic(marketAddr, exactSyOut);
        const { netPtIn } = res;
        const approxParam = Router.guessInApproxParams(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapSyForExactPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'swapSyForExactPt', { netSyIn: BN; netSyFee: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactPtStatic(marketAddr, exactPtOut);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            metaMethodType,
            res
        );
    }

    async swapExactTokenForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForPt',
        {
            netPtOut: BN;
            input: TokenInputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
        }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const tokenMintSyList = await market.syEntity().then((sy) => sy.getTokensIn());
        const overrides = {
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .swapExactBaseTokenForPtStatic(marketAddr, token, amount)
                .then(({ netPtOut, netSyFee }) => ({ netOut: netPtOut, netSyFee }))
        );

        const { netOut: netPtOut, input } = res;

        if (netPtOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', tokenIn, marketAddr);
        }

        return this.contract.metaCall.swapExactTokenForPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            input,
            metaMethodType,
            { ...res, netPtOut, overrides }
        );
    }

    async swapExactSyForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'swapExactSyForPt', { netPtOut: BN; netSyFee: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForPtStatic(marketAddr, exactSyIn);
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactSyForPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            metaMethodType,
            res
        );
    }

    async mintSyFromToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'mintSyFromToken',
        { netSyOut: BN; input: TokenInputStruct; kybercallData: KybercallData }
    > {
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.chainId, this.networkConnection);
        }
        const syAddr = sy.address;
        const syEntity = sy; // force type here
        const tokenMintSyList = await sy.getTokensIn();
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            syEntity.previewDeposit(token, amount).then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
        );
        const { netOut: netSyOut, input } = res;

        if (netSyOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('mint', tokenIn, syAddr);
        }

        return this.contract.metaCall.mintSyFromToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            syAddr,
            calcSlippedDownAmount(netSyOut, slippage),
            input,
            metaMethodType,
            { ...res, netSyOut }
        );
    }

    async redeemSyToToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        netSyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'redeemSyToToken',
        { netTokenOut: BN; output: TokenOutputStruct; kybercallData: KybercallData }
    > {
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.chainId, this.networkConnection);
        }
        const tokenRedeemSyList = await sy.getTokensOut();
        const res = await this.outputParams(sy.address, netSyIn, tokenOut, tokenRedeemSyList, slippage);

        const { output, netOut: netTokenOut } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', sy.address, tokenOut);
        }

        return this.contract.metaCall.redeemSyToToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            sy.address,
            netSyIn,
            output,
            metaMethodType,
            {
                ...res,
                netTokenOut,
            }
        );
    }

    async mintPyFromToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'mintPyFromToken',
        { netPyOut: BN; input: TokenInputStruct; kybercallData: KybercallData }
    > {
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.chainId, this.networkConnection);
        }
        const ytAddr = yt.address;
        const sy = await yt.syEntity();
        const tokenMintSyList = await sy.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .mintPYFromBaseStatic(ytAddr, token, amount)
                .then((netOut) => ({ netOut, netSyFee: etherConstants.Zero }))
        );
        const { netOut: netPyOut, input } = res;

        if (netPyOut.eq(etherConstants.NegativeOne)) {
            // TODO: should we use `mintPY` as the action name instead of `mint`?
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }

        return this.contract.metaCall.mintPyFromToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            ytAddr,
            calcSlippedDownAmount(netPyOut, slippage),
            input,
            metaMethodType,
            { ...res, netPyOut, overrides }
        );
    }

    async redeemPyToToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'redeemPyToToken',
        { netTokenOut: BN; kybercallData: KybercallData; output: TokenOutputStruct }
    > {
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.chainId, this.networkConnection);
        }
        const ytAddr = yt.address;
        const getSyPromise = yt.syEntity();
        const [sy, tokenRedeemSyList, pyIndex] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            yt.pyIndexCurrent(),
        ]);
        const res = await this.outputParams(
            sy.address,
            new PyIndex(pyIndex).assetToSy(netPyIn),
            tokenOut,
            tokenRedeemSyList,
            slippage
        );
        const { netOut: netTokenOut, output } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }

        return this.contract.metaCall.redeemPyToToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            ytAddr,
            netPyIn,
            output,
            metaMethodType,
            {
                ...res,
                netTokenOut,
            }
        );
    }

    async swapExactSyForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForYt',
        { netYtOut: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForYtStatic(marketAddr, exactSyIn);
        const { netYtOut } = res;
        const approxParam = Router.guessOutApproxParams(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapYtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapYtForExactSy',
        { netYtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapYtForExactSyStatic(marketAddr, exactSyOut);
        const { netYtIn } = res;
        const approxParam = Router.guessInApproxParams(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netYtIn, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapExactPtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn),
        ]);
        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { output, netOut: netTokenOut } = res;

        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            throw NoRouteFoundError.action('swap', await market.pt(), tokenOut);
        }

        return this.contract.metaCall.swapExactPtForToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactPtIn,
            output,
            metaMethodType,
            {
                ...res,
                netTokenOut,
                intermediateSy,
                netSyFee,
            }
        );
    }

    async swapExactYtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'swapExactYtForSy', { netSyOut: BN; netSyFee: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactYtForSy(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            metaMethodType,
            res
        );
    }

    async swapSyForExactYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<T, 'swapSyForExactYt', { netSyIn: BN; netSyFee: BN }> {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactYtStatic(marketAddr, exactYtOut);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactYt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            metaMethodType,
            res
        );
    }

    async swapExactTokenForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForYt',
        {
            netYtOut: BN;
            input: TokenInputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
        }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity();
        const tokenMintSyList = await sy.getTokensIn();
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(tokenIn, netTokenIn, tokenMintSyList, ({ token, amount }) =>
            this.routerStaticCall
                .swapExactBaseTokenForYtStatic(marketAddr, token, amount)
                .then(({ netYtOut, netSyFee }) => ({ netOut: netYtOut, netSyFee }))
        );

        const { netOut: netYtOut, input } = res;

        if (netYtOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        return this.contract.metaCall.swapExactTokenForYt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            input,
            metaMethodType,
            { ...res, netYtOut, overrides }
        );
    }

    async swapExactYtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForToken',
        {
            netTokenOut: BN;
            output: TokenOutputStruct;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
        }
    > {
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.chainId, this.networkConnection);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity();
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut()),
            this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn),
        ]);
        const res = await this.outputParams(sy.address, intermediateSy, tokenOut, tokenRedeemSyList, slippage);

        const { netOut: netTokenOut, output } = res;
        if (netTokenOut.eq(etherConstants.NegativeOne)) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt());
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        return this.contract.metaCall.swapExactYtForToken(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactYtIn,
            output,
            metaMethodType,
            {
                ...res,
                netTokenOut,
                intermediateSy,
                netSyFee,
            }
        );
    }

    async swapExactYtForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForPt',
        {
            netPtOut: BN;
            totalPtSwapped: BN;
            netSyFee: BN;
            priceImpact: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForPtStatic(marketAddr, exactYtIn);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = Router.guessInApproxParams(totalPtSwapped, slippage);
        return this.contract.metaCall.swapExactYtForPt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netPtOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }

    async swapExactPtForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        metaMethodType?: T
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForYt',
        {
            netYtOut: BN;
            totalPtToSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForYtStatic(marketAddr, exactPtIn);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(totalPtToSwap, slippage);
        return this.contract.metaCall.swapExactPtForYt(
            ContractMetaMethod.utils.getContractSignerAddress,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            approxParam,
            metaMethodType,
            { ...res, approxParam }
        );
    }
}
