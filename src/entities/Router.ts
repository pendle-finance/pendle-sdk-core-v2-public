import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import {
    RouterStatic,
    WrappedContract,
    MetaMethodType,
    MetaMethodReturnType,
    ContractMethodNames,
    ContractMetaMethod,
    MetaMethodExtraParams,
    mergeMetaMethodExtraParams as mergeParams,
    getRouterStatic,
} from '../contracts';
import type { ApproxParamsStruct, IPAllAction } from '@pendle/core-v2/typechain-types/IPAllAction';
import { abi as IPAllActionABI } from '@pendle/core-v2/build/artifacts/contracts/interfaces/IPAllAction.sol/IPAllAction.json';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants as etherConstants, BytesLike } from 'ethers';
import { MarketEntity } from './MarketEntity';
import { SyEntity } from './SyEntity';
import { YtEntity } from './YtEntity';
import { NoRouteFoundError, PendleSdkError } from '../errors';
import { KyberHelper, KybercallData, KyberState, KyberHelperCoreConfig } from './KyberHelper';
import { BulkSellerUsageStrategy, UseBulkMode } from '../bulkSeller';
import { getGlobalBulkSellerUsageStrategyGetter } from '../bulkSeller';
import {
    Address,
    getContractAddresses,
    isNativeToken,
    ChainId,
    RawTokenAmount,
    devLog,
    promiseAllWithErrors,
    mapPromisesToSyncUp,
    toArrayOfStructures,
} from '../common';
import { calcSlippedDownAmount, calcSlippedUpAmount, calcSlippedDownAmountSqrt, PyIndex } from '../common/math';

export type TokenInput = {
    tokenIn: Address;
    netTokenIn: BigNumberish;
    tokenMintSy: Address;
    bulk: Address;
    kyberRouter: Address;
    kybercall: BytesLike;
};

export type TokenOutput = {
    tokenOut: Address;
    minTokenOut: BigNumberish;
    tokenRedeemSy: Address;
    bulk: Address;
    kyberRouter: Address;
    kybercall: BytesLike;
};

export type RouterState = {
    kyberHelper: KyberState;
};

export type RouterConfig = PendleEntityConfigOptionalAbi & {
    chainId: ChainId;
    kyberHelper?: KyberHelperCoreConfig;
    bulkSellerUsage?: BulkSellerUsageStrategy;
};

export type RouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver?: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    useBulk?: UseBulkMode;
};

type FixedRouterMetaMethodExtraParams<T extends MetaMethodType> = MetaMethodExtraParams<T> & {
    receiver: Address | typeof ContractMetaMethod.utils.getContractSignerAddress;
    useBulk: UseBulkMode;
    entityConfig: RouterConfig;

    // this is a copy of this type, but used for the inner callStatic to calculate stuff
    forCallStatic: Omit<FixedRouterMetaMethodExtraParams<T>, 'forCallStatic' | 'method'>;
};

export type RouterMetaMethodReturnType<
    T extends MetaMethodType,
    M extends ContractMethodNames<IPAllAction>,
    Data extends {}
> = MetaMethodReturnType<T, IPAllAction, M, Data & RouterMetaMethodExtraParams<T>>;

export class Router extends PendleEntity {
    static readonly MIN_AMOUNT = 0;
    static readonly MAX_AMOUNT = etherConstants.MaxUint256;
    static readonly STATIC_APPROX_PARAMS = {
        guessMin: Router.MIN_AMOUNT,
        guessMax: Router.MAX_AMOUNT,
        guessOffchain: 0,
        maxIteration: 20,
        eps: BN.from(10).pow(15),
    };
    readonly routerStatic: WrappedContract<RouterStatic>;
    readonly kyberHelper: KyberHelper;
    readonly bulkSellerUsage: BulkSellerUsageStrategy;
    readonly chainId: ChainId;

    constructor(readonly address: Address, config: RouterConfig) {
        super(address, { abi: IPAllActionABI, ...config });
        this.chainId = config.chainId;
        const { kyberHelper: kyberHelperCoreConfig } = { ...config };
        this.routerStatic = getRouterStatic(config);

        this.kyberHelper = new KyberHelper(address, {
            chainId: this.chainId,
            ...this.networkConnection,
            ...kyberHelperCoreConfig,
        });

        this.bulkSellerUsage = config.bulkSellerUsage ?? getGlobalBulkSellerUsageStrategyGetter(this.routerStatic);
    }

    get contract() {
        return this._contract as WrappedContract<IPAllAction>;
    }

    override get entityConfig(): RouterConfig {
        return { ...super.entityConfig, chainId: this.chainId, bulkSellerUsage: this.bulkSellerUsage };
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

    getDefaultMetaMethodExtraParams<T extends MetaMethodType>(): FixedRouterMetaMethodExtraParams<T> {
        const superParams = super.getDefaultMetaMethodExtraParams<T>();
        const method = superParams.method;

        const baseResult = {
            ...superParams,
            receiver: ContractMetaMethod.utils.getContractSignerAddress,
            useBulk: 'auto',
            entityConfig: this.entityConfig,
            method: undefined,
        } as const;

        const forCallStatic = {
            ...baseResult,
            overrides: { ...superParams.overrides, gasPrice: undefined, gasLimit: undefined, value: undefined },
        };

        return {
            ...baseResult,
            method,
            forCallStatic,
        };
    }

    /**
     * Redefine the method to redefine the return type
     */
    addExtraParams<T extends MetaMethodType>(
        params: RouterMetaMethodExtraParams<T>
    ): FixedRouterMetaMethodExtraParams<T> {
        return mergeParams(this.getDefaultMetaMethodExtraParams(), params);
    }

    /**
     * Create a Router object for a given config.
     * @remarks
     * The address of {@link Router} is obtained from the `config`.
     * @param config
     * @returns
     */
    static getRouter(config: RouterConfig): Router {
        return new Router(getContractAddresses(config.chainId).ROUTER, config);
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

    /**
     * Find the best route to convert `tokenInAmount.token` to a token from `tokenMintSyList` via KyberSwap,
     * so that the result of `fn` is maximized.
     *
     * @param tokenInAmount - to pair of token in address with its amount to test.
     * @param sy - the address of the SY token.
     * @param tokenMintSyList - the list of of token in of `sy`.
     * @param kyberswapSlippage - the slippage for kyberswap, from [0, 0.2]
     * @param useBulkMode
     * @param fn the function to maximize
     * @returns
     * Besides `Data` that is returned from `fn`, the {@link TokenInput} and the {@link KybercallData} is
     * also returned.
     *
     * If there is no route at all, `undefined` is returned.
     */
    async inputParams<Data extends { netOut: BN }>(
        tokenInAmount: RawTokenAmount<BigNumberish>,
        sy: Address,
        tokenMintSyList: Address[],
        kyberswapSlippage: number,
        useBulkMode: UseBulkMode,
        /**
         * @param tokenMintSyAmount - the pair of token mint sy, with its amount traded from `tokenInAmount`
         * @param input - the {@link TokenInput} struct. It is the type-safe version of {@link TokenInputStruct},
         *      and can be used to pass to some contract methods.
         * @returns
         * The result must have the `netOut` properties - the amount to maximized.
         *
         * It can also return more additional fields, and the fields are merged to the result of this function.
         */
        fn: (tokenMintSyAmount: RawTokenAmount<BigNumberish>, input: TokenInput) => Promise<Data>
    ): Promise<undefined | (Data & { input: TokenInput; kybercallData: KybercallData })> {
        if (tokenMintSyList.includes(tokenInAmount.token)) {
            // force routing through tokenInAmount.token
            tokenMintSyList = [tokenInAmount.token];
        }

        const processTokenCalls = mapPromisesToSyncUp(
            2,
            tokenMintSyList,
            async ([afterKyberSwapSyncUp, afterBulkSellerSyncUp], tokenMintSy: Address, id: number) => {
                try {
                    const kybercallDataOrUndefined = await this.kyberHelper.makeCall(
                        tokenInAmount,
                        tokenMintSy,
                        kyberswapSlippage
                    );
                    await afterKyberSwapSyncUp(id);

                    if (kybercallDataOrUndefined == undefined) {
                        return [];
                    }
                    // force typing before the callback
                    const kybercallData = kybercallDataOrUndefined;
                    const kybercall = kybercallData.encodedSwapData;

                    const bulkResult = await this.bulkSellerUsage.determineByToken(
                        useBulkMode,
                        { token: tokenMintSy, amount: kybercallData.outputAmount },
                        sy
                    );

                    await afterBulkSellerSyncUp(id);

                    return bulkResult.tryInvoke(async (bulkSellerAddress) => {
                        const input: TokenInput = {
                            tokenIn: tokenInAmount.token,
                            netTokenIn: tokenInAmount.amount,
                            tokenMintSy,
                            kybercall,
                            bulk: bulkSellerAddress,
                            kyberRouter: kybercallData.routerAddress,
                        };

                        const data = await fn({ token: tokenMintSy, amount: kybercallData.outputAmount }, input);
                        return [{ ...data, input, kybercallData }];
                    });
                } catch (e: any) {
                    devLog('Router input params error: ', e);
                    if (e instanceof PendleSdkError) {
                        throw e;
                    }
                    return [];
                }
            }
        );

        const [results, errors] = await promiseAllWithErrors(processTokenCalls);
        const flattenResults = results.flat();
        if (flattenResults.length === 0) {
            if (errors.length > 0) {
                throw errors[0];
            }
            return undefined;
        }
        return flattenResults.reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    /**
     * Find the best route to redeem from a SY token to a given token via KyberSwap,
     * so that the amount received is maximized.
     * @param syAmount - the pair of SY token address with the corresponding amount.
     * @param tokenOut - the token to redeem to.
     * @param tokenRedeemSyList - the list of token out of the given SY token.
     * @param useBulkMode
     * @param slippage
     * @param params.syEntity - the syEntity of the given token, to avoid recreating object.
     * @returns
     * - `netOut` - the amount of `tokenOut` to maximize.
     * - `output` - the {@link TokenOutput}, which is a type-safe version of {@link TokenOutputStruct}, and
     * can be used to pass to contract methods.
     * - `kybercallData` - the data returned from KyberSwap, contains the swapping route.
     * - `redeemFromSyAmount` - the amount of the intermediate token (that is, of `output.tokenRedeemSy`)
     * got from redeeming the given SY to that token.
     *
     * If no route exists, `undefined` is returned instead.
     */
    async outputParams(
        syAmount: RawTokenAmount<BigNumberish>,
        tokenOut: Address,
        tokenRedeemSyList: Address[],
        useBulkMode: UseBulkMode,
        slippage: number,
        params: { syEntity?: SyEntity } = {}
    ): Promise<
        undefined | { netOut: BN; output: TokenOutput; kybercallData: KybercallData; redeemedFromSyAmount: BN }
    > {
        const syEntity = params.syEntity ?? new SyEntity(syAmount.token, this.entityConfig);

        const processTokenRedeemSy = async (tokenRedeemSy: Address) => {
            const useBulkResult = await this.bulkSellerUsage.determineBySy(useBulkMode, syAmount, tokenRedeemSy);
            return useBulkResult.tryInvoke(async (bulkSellerAddress) => {
                const redeemedFromSyAmount = await syEntity.previewRedeem(tokenRedeemSy, syAmount.amount, {
                    useBulk: { withAddress: bulkSellerAddress },
                });
                const kybercallData = await this.kyberHelper.makeCall(
                    { token: tokenRedeemSy, amount: redeemedFromSyAmount },
                    tokenOut,
                    // kyberswap slippage equal to our slippage
                    slippage
                );
                if (kybercallData === undefined) {
                    return [];
                }

                const netOut = BN.from(kybercallData.outputAmount);

                const output: TokenOutput = {
                    tokenOut,
                    tokenRedeemSy,
                    kybercall: kybercallData.encodedSwapData,
                    minTokenOut: calcSlippedDownAmount(netOut, slippage),
                    bulk: bulkSellerAddress,
                    kyberRouter: kybercallData.routerAddress,
                };

                return [{ netOut, output, kybercallData, redeemedFromSyAmount }];
            });
        };
        if (tokenRedeemSyList.includes(tokenOut)) {
            const [result] = await processTokenRedeemSy(tokenOut);
            return result;
        }
        const results = (await Promise.all(tokenRedeemSyList.map(processTokenRedeemSy))).flat();
        if (results.length === 0) return undefined;
        return results.reduce((prev, cur) => (cur.netOut.gt(prev.netOut) ? cur : prev));
    }

    async addLiquidityDualSyAndPt<T extends MetaMethodType = 'send'>(
        market: Address | MarketEntity,
        syDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualSyAndPt', { netLpOut: BN; netSyUsed: BN; netPtUsed: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquidityDualSyAndPtStatic(
            marketAddr,
            syDesired,
            ptDesired,
            params.forCallStatic
        );
        const { netLpOut } = res;
        return this.contract.metaCall.addLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            syDesired,
            ptDesired,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            { ..._params, ...res }
        );
    }

    async addLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        tokenDesired: BigNumberish,
        ptDesired: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'addLiquidityDualTokenAndPt', { netLpOut: BN; netTokenUsed: BN; netPtUsed: BN }> {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity(params.forCallStatic);
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);
        const overrides = { value: isNativeToken(tokenIn) ? tokenDesired : undefined };

        const res = await this.inputParams(
            { token: tokenIn, amount: tokenDesired },
            sy.address,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ token, amount }, input) =>
                this.routerStaticCall
                    .addLiquidityDualTokenAndPtStatic(
                        marketAddr,
                        token,
                        amount,
                        input.bulk,
                        ptDesired,
                        params.forCallStatic
                    )
                    .then((data) => ({ netOut: data.netLpOut, ...data }))
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('add liquidity', tokenIn, marketAddr);
        }
        const { netLpOut, input } = res;
        return this.contract.metaCall.addLiquidityDualTokenAndPt(
            params.receiver,
            marketAddr,
            input,
            ptDesired,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            { ...res, ...mergeParams({ overrides }, params) }
        );
    }

    async addLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netPtIn: BigNumberish,
        slippage: number,
        _params: MetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySinglePt',
        {
            netLpOut: BN;
            netPtToSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySinglePtStatic(marketAddr, netPtIn, params.forCallStatic);
        const { netLpOut, netPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(netPtToSwap, slippage);
        return this.contract.metaCall.addLiquiditySinglePt(
            params.receiver,
            marketAddr,
            netPtIn,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async addLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        netSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleSy',
        {
            netLpOut: BN;
            netPtFromSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.addLiquiditySingleSyStatic(marketAddr, netSyIn, params.forCallStatic);
        const { netPtFromSwap, netLpOut } = res;
        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);

        return this.contract.metaCall.addLiquiditySingleSy(
            params.receiver,
            marketAddr,
            netSyIn,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            { ...res, approxParam, ...params }
        );
    }

    async addLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'addLiquiditySingleToken',
        {
            netLpOut: BN;
            netPtFromSwap: BN;
            input: TokenInput;
            priceImpact: BN;
            kybercallData: KybercallData;
            netSyFee: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity(params.forCallStatic);
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);

        const res = await this.inputParams(
            { token: tokenIn, amount: netTokenIn },
            sy.address,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ amount }, input) =>
                this.routerStaticCall
                    .addLiquiditySingleBaseTokenStatic(
                        marketAddr,
                        input.tokenMintSy,
                        amount,
                        input.bulk,
                        params.forCallStatic
                    )
                    .then((data) => ({ netOut: data.netLpOut, ...data }))
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('add liquidity', tokenIn, marketAddr);
        }
        const { netLpOut, netPtFromSwap, input } = res;

        const approxParam = Router.guessOutApproxParams(netPtFromSwap, slippage);
        const overrides = { value: isNativeToken(input.tokenIn) ? input.netTokenIn : undefined };

        return this.contract.metaCall.addLiquiditySingleToken(
            params.receiver,
            marketAddr,
            calcSlippedDownAmountSqrt(netLpOut, slippage), // note: different slip down amount function
            approxParam,
            input,
            { ...res, ...mergeParams({ overrides }, params) }
        );
    }

    async removeLiquidityDualSyAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'removeLiquidityDualSyAndPt', { netSyOut: BN; netPtOut: BN }> {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquidityDualSyAndPtStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netSyOut, netPtOut } = res;
        return this.contract.metaCall.removeLiquidityDualSyAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            calcSlippedDownAmount(netPtOut, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquidityDualTokenAndPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquidityDualTokenAndPt',
        {
            netTokenOut: BN;
            netPtOut: BN;
            intermediateSy: BN;
            output: TokenOutput;
            kybercallData: KybercallData;
            redeemedFromSyAmount: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }

        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.forCallStatic);

        // TODO reduce RPC call
        const [sy, tokenRedeemSy, { netSyOut: intermediateSy, netPtOut }] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.forCallStatic)),
            this.routerStaticCall.removeLiquidityDualSyAndPtStatic(marketAddr, lpToRemove, params.forCallStatic),
        ]);

        const res = await this.outputParams(
            { token: sy.address, amount: intermediateSy },
            tokenOut,
            tokenRedeemSy,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('remove liquidity', marketAddr, tokenOut);
        }

        const { netOut: netTokenOut, output } = res;
        this.contract.removeLiquidityDualTokenAndPt;
        return this.contract.metaCall.removeLiquidityDualTokenAndPt(
            params.receiver,
            marketAddr,
            lpToRemove,
            output,
            calcSlippedDownAmount(netPtOut, slippage),
            { ...res, ...params, intermediateSy, netTokenOut, netPtOut }
        );
    }

    async removeLiquiditySinglePt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySinglePt',
        { netPtOut: BN; netPtFromSwap: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySinglePtStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netPtOut, netPtFromSwap } = res;
        return this.contract.metaCall.removeLiquiditySinglePt(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtFromSwap, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySingleSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.removeLiquiditySingleSyStatic(
            marketAddr,
            lpToRemove,
            params.forCallStatic
        );
        const { netSyOut } = res;
        return this.contract.metaCall.removeLiquiditySingleSy(
            params.receiver,
            marketAddr,
            lpToRemove,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async removeLiquiditySingleToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        lpToRemove: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'removeLiquiditySingleToken',
        {
            netTokenOut: BN;
            output: TokenOutput;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
            priceImpact: BN;
            redeemedFromSyAmount: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.forCallStatic);
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee, priceImpact, exchangeRateAfter }] =
            await Promise.all([
                getSyPromise,
                getSyPromise.then((sy) => sy.getTokensOut(params.forCallStatic)),
                this.routerStaticCall.removeLiquiditySingleSyStatic(marketAddr, lpToRemove, params.forCallStatic),
            ]);

        const res = await this.outputParams(
            { token: sy.address, amount: intermediateSy },
            tokenOut,
            tokenRedeemSyList,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('zap out', marketAddr, tokenOut);
        }

        const { netOut: netTokenOut, output } = res;

        return this.contract.metaCall.removeLiquiditySingleToken(params.receiver, marketAddr, lpToRemove, output, {
            ...res,
            intermediateSy,
            netSyFee,
            netTokenOut,
            priceImpact,
            exchangeRateAfter,
            ...params,
        });
    }

    async swapExactPtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.forCallStatic);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactPtForSy(
            params.receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async swapPtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapPtForExactSy',
        { netPtIn: BN; netSyFee: BN; approxParam: ApproxParamsStruct; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapPtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netPtIn } = res;
        const approxParam = Router.guessInApproxParams(netPtIn, slippage);
        return this.contract.metaCall.swapPtForExactSy(
            params.receiver,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netPtIn, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapSyForExactPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactPt',
        { netSyIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactPtStatic(marketAddr, exactPtOut, params.forCallStatic);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactPt(
            params.receiver,
            marketAddr,
            exactPtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            { ...res, ...params }
        );
    }

    async swapExactTokenForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForPt',
        {
            netPtOut: BN;
            input: TokenInput;
            kybercallData: KybercallData;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity(params.forCallStatic);
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);
        const overrides = {
            value: isNativeToken(tokenIn) ? netTokenIn : undefined,
        };
        const res = await this.inputParams(
            { token: tokenIn, amount: netTokenIn },
            sy.address,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ token, amount }, input) =>
                this.routerStaticCall
                    .swapExactBaseTokenForPtStatic(marketAddr, token, amount, input.bulk, params.forCallStatic)
                    .then((data) => ({ netOut: data.netPtOut, ...data }))
        );

        if (res === undefined) {
            const pt = await market.pt(params.forCallStatic);
            throw NoRouteFoundError.action('swap', tokenIn, pt);
        }

        const { netOut: netPtOut, input } = res;

        return this.contract.metaCall.swapExactTokenForPt(
            params.receiver,
            marketAddr,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            input,
            { ...res, netPtOut, ...mergeParams({ overrides }, params) }
        );
    }

    async swapExactSyForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForPt',
        { netPtOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForPtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netPtOut } = res;
        return this.contract.metaCall.swapExactSyForPt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netPtOut, slippage),
            Router.guessOutApproxParams(netPtOut, slippage),
            { ...res, ...params }
        );
    }

    async mintSyFromToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'mintSyFromToken',
        { netSyOut: BN; input: TokenInput; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.entityConfig);
        }
        const syAddr = sy.address;
        const syEntity = sy; // force type here
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);
        const res = await this.inputParams(
            { token: tokenIn, amount: netTokenIn },
            syAddr,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ token, amount }, input) =>
                syEntity
                    .previewDeposit(token, amount, { ...params.forCallStatic, useBulk: { withAddress: input.bulk } })
                    .then((netOut) => ({ netOut }))
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('mint', tokenIn, syAddr);
        }
        const { netOut: netSyOut, input } = res;

        return this.contract.metaCall.mintSyFromToken(
            params.receiver,
            syAddr,
            calcSlippedDownAmount(netSyOut, slippage),
            input,
            { ...res, netSyOut, ...params }
        );
    }

    async redeemSyToToken<T extends MetaMethodType>(
        sy: Address | SyEntity,
        netSyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'redeemSyToToken',
        { netTokenOut: BN; output: TokenOutput; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof sy === 'string') {
            sy = new SyEntity(sy, this.entityConfig);
        }
        const tokenRedeemSyList = await sy.getTokensOut(params.forCallStatic);
        const res = await this.outputParams(
            { token: sy.address, amount: netSyIn },
            tokenOut,
            tokenRedeemSyList,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('redeem', sy.address, tokenOut);
        }

        const { output, netOut: netTokenOut } = res;

        return this.contract.metaCall.redeemSyToToken(params.receiver, sy.address, netSyIn, output, {
            ...res,
            netTokenOut,
            ...params,
        });
    }

    async mintPyFromToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'mintPyFromToken',
        { netPyOut: BN; input: TokenInput; kybercallData: KybercallData }
    > {
        const params = this.addExtraParams(_params);
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.entityConfig);
        }
        const ytAddr = yt.address;
        const sy = await yt.syEntity(params.forCallStatic);
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(
            { token: tokenIn, amount: netTokenIn },
            sy.address,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ token, amount }, input) =>
                this.routerStaticCall
                    .mintPYFromBaseStatic(ytAddr, token, amount, input.bulk, params.forCallStatic)
                    .then((netOut) => ({ netOut }))
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('mint', tokenIn, ytAddr);
        }
        const { netOut: netPyOut, input } = res;

        return this.contract.metaCall.mintPyFromToken(
            params.receiver,
            ytAddr,
            calcSlippedDownAmount(netPyOut, slippage),
            input,
            { ...res, netPyOut, ...mergeParams({ overrides }, params) }
        );
    }

    async mintPyFromSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountSyToMint: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ) {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netPyOut = await this.routerStaticCall.mintPYFromSyStatic(ytAddr, amountSyToMint);
        return this.contract.metaCall.mintPyFromSy(
            params.receiver,
            ytAddr,
            amountSyToMint,
            calcSlippedDownAmount(netPyOut, slippage),
            { ...params, netPyOut }
        );
    }

    async redeemPyToToken<T extends MetaMethodType>(
        yt: Address | YtEntity,
        netPyIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'redeemPyToToken',
        { netTokenOut: BN; kybercallData: KybercallData; output: TokenOutput }
    > {
        const params = this.addExtraParams(_params);
        if (typeof yt === 'string') {
            yt = new YtEntity(yt, this.entityConfig);
        }
        const ytAddr = yt.address;
        const getSyPromise = yt.syEntity(params.forCallStatic);
        const [sy, tokenRedeemSyList, pyIndex] = await Promise.all([
            getSyPromise,
            getSyPromise.then((sy) => sy.getTokensOut(params.forCallStatic)),
            yt.pyIndexCurrent(params.forCallStatic),
        ]);
        const res = await this.outputParams(
            { token: sy.address, amount: new PyIndex(pyIndex).assetToSy(netPyIn) },
            tokenOut,
            tokenRedeemSyList,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('redeem', ytAddr, tokenOut);
        }
        const { netOut: netTokenOut, output } = res;

        return this.contract.metaCall.redeemPyToToken(params.receiver, ytAddr, netPyIn, output, {
            ...res,
            netTokenOut,
            ...params,
        });
    }

    async redeemPyToSy<T extends MetaMethodType>(
        yt: Address | YtEntity,
        amountPyToRedeem: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T>
    ) {
        const params = this.addExtraParams(_params);
        const ytAddr = typeof yt === 'string' ? yt : yt.address;
        const netSyOut = await this.routerStaticCall.redeemPYToSyStatic(ytAddr, amountPyToRedeem);
        return this.contract.metaCall.redeemPyToSy(
            params.receiver,
            ytAddr,
            amountPyToRedeem,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...params, netSyOut }
        );
    }

    async swapExactSyForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactSyForYt',
        { netYtOut: BN; netSyFee: BN; approxParam: ApproxParamsStruct; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactSyForYtStatic(marketAddr, exactSyIn, params.forCallStatic);
        const { netYtOut } = res;
        const approxParam = Router.guessOutApproxParams(netYtOut, slippage);
        return this.contract.metaCall.swapExactSyForYt(
            params.receiver,
            marketAddr,
            exactSyIn,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            { ...res, approxParam, ...params }
        );
    }

    async swapYtForExactSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactSyOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapYtForExactSy',
        { netYtIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN; approxParam: ApproxParamsStruct }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapYtForExactSyStatic(marketAddr, exactSyOut, params.forCallStatic);
        const { netYtIn } = res;
        const approxParam = Router.guessInApproxParams(netYtIn, slippage);
        return this.contract.metaCall.swapYtForExactSy(
            params.receiver,
            marketAddr,
            exactSyOut,
            calcSlippedUpAmount(netYtIn, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapExactPtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForToken',
        {
            netTokenOut: BN;
            output: TokenOutput;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.forCallStatic);
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee, priceImpact, exchangeRateAfter }] =
            await Promise.all([
                getSyPromise,
                getSyPromise.then((sy) => sy.getTokensOut(params.forCallStatic)),
                this.routerStaticCall.swapExactPtForSyStatic(marketAddr, exactPtIn, params.forCallStatic),
            ]);
        const res = await this.outputParams(
            { token: sy.address, amount: intermediateSy },
            tokenOut,
            tokenRedeemSyList,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            throw NoRouteFoundError.action('swap', await market.pt(params.forCallStatic), tokenOut);
        }

        const { output, netOut: netTokenOut } = res;

        return this.contract.metaCall.swapExactPtForToken(params.receiver, marketAddr, exactPtIn, output, {
            ...res,
            netTokenOut,
            intermediateSy,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
            ...params,
        });
    }

    async swapExactYtForSy<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForSy',
        { netSyOut: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.forCallStatic);
        const { netSyOut } = res;
        return this.contract.metaCall.swapExactYtForSy(
            params.receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netSyOut, slippage),
            { ...res, ...params }
        );
    }

    async swapSyForExactYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtOut: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapSyForExactYt',
        { netSyIn: BN; netSyFee: BN; priceImpact: BN; exchangeRateAfter: BN }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapSyForExactYtStatic(marketAddr, exactYtOut, params.forCallStatic);
        const { netSyIn } = res;
        return this.contract.metaCall.swapSyForExactYt(
            params.receiver,
            marketAddr,
            exactYtOut,
            calcSlippedUpAmount(netSyIn, slippage),
            { ...res, ...params }
        );
    }

    async swapExactTokenForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        tokenIn: Address,
        netTokenIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactTokenForYt',
        {
            netYtOut: BN;
            input: TokenInput;
            kybercallData: KybercallData;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const sy = await market.syEntity(params.forCallStatic);
        const tokenMintSyList = await sy.getTokensIn(params.forCallStatic);
        const overrides = { value: isNativeToken(tokenIn) ? netTokenIn : undefined };
        const res = await this.inputParams(
            { token: tokenIn, amount: netTokenIn },
            sy.address,
            tokenMintSyList,
            slippage,
            params.useBulk,
            ({ token, amount }, input) =>
                this.routerStaticCall
                    .swapExactBaseTokenForYtStatic(marketAddr, token, amount, input.bulk, params.forCallStatic)
                    .then((data) => ({ netOut: data.netYtOut, ...data }))
        );
        if (res === undefined) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt(params.forCallStatic));
            throw NoRouteFoundError.action('swap', tokenIn, yt);
        }

        const { netOut: netYtOut, input } = res;

        return this.contract.metaCall.swapExactTokenForYt(
            params.receiver,
            marketAddr,
            calcSlippedDownAmount(netYtOut, slippage),
            Router.guessOutApproxParams(netYtOut, slippage),
            input,
            { ...res, netYtOut, ...mergeParams({ overrides }, params) }
        );
    }

    async swapExactYtForToken<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        tokenOut: Address,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForToken',
        {
            netTokenOut: BN;
            output: TokenOutput;
            kybercallData: KybercallData;
            netSyFee: BN;
            intermediateSy: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
        }
    > {
        const params = this.addExtraParams(_params);
        if (typeof market === 'string') {
            market = new MarketEntity(market, this.entityConfig);
        }
        const marketAddr = market.address;
        const getSyPromise = market.syEntity(params.forCallStatic);
        const [sy, tokenRedeemSyList, { netSyOut: intermediateSy, netSyFee, priceImpact, exchangeRateAfter }] =
            await Promise.all([
                getSyPromise,
                getSyPromise.then((sy) => sy.getTokensOut(params.forCallStatic)),
                this.routerStaticCall.swapExactYtForSyStatic(marketAddr, exactYtIn, params.forCallStatic),
            ]);
        const res = await this.outputParams(
            { token: sy.address, amount: intermediateSy },
            tokenOut,
            tokenRedeemSyList,
            params.useBulk,
            slippage,
            { syEntity: sy }
        );
        if (res === undefined) {
            // TODO: One additional call to get the yt address, does it worth it?
            let yt = await market.ptEntity().then((pt) => pt.yt(params.forCallStatic));
            throw NoRouteFoundError.action('swap', yt, tokenOut);
        }

        const { netOut: netTokenOut, output } = res;
        return this.contract.metaCall.swapExactYtForToken(params.receiver, marketAddr, exactYtIn, output, {
            ...res,
            netTokenOut,
            intermediateSy,
            netSyFee,
            priceImpact,
            exchangeRateAfter,
            ...params,
        });
    }

    async swapExactYtForPt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactYtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactYtForPt',
        {
            netPtOut: BN;
            totalPtSwapped: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactYtForPtStatic(marketAddr, exactYtIn, params.forCallStatic);
        const { netPtOut, totalPtSwapped } = res;
        const approxParam = Router.guessInApproxParams(totalPtSwapped, slippage);
        return this.contract.metaCall.swapExactYtForPt(
            params.receiver,
            marketAddr,
            exactYtIn,
            calcSlippedDownAmount(netPtOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async swapExactPtForYt<T extends MetaMethodType>(
        market: Address | MarketEntity,
        exactPtIn: BigNumberish,
        slippage: number,
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<
        T,
        'swapExactPtForYt',
        {
            netYtOut: BN;
            totalPtToSwap: BN;
            netSyFee: BN;
            priceImpact: BN;
            exchangeRateAfter: BN;
            approxParam: ApproxParamsStruct;
        }
    > {
        const params = this.addExtraParams(_params);
        const marketAddr = typeof market === 'string' ? market : market.address;
        const res = await this.routerStaticCall.swapExactPtForYtStatic(marketAddr, exactPtIn, params.forCallStatic);
        const { netYtOut, totalPtToSwap } = res;
        const approxParam = Router.guessInApproxParams(totalPtToSwap, slippage);
        return this.contract.metaCall.swapExactPtForYt(
            params.receiver,
            marketAddr,
            exactPtIn,
            calcSlippedDownAmount(netYtOut, slippage),
            approxParam,
            { ...res, approxParam, ...params }
        );
    }

    async sellSys(
        tokenOut: Address,
        slippage: number,
        sysAndSyIns: { sys: Address[]; netSyIns: BigNumberish[] }
    ): Promise<TokenOutput[]>;
    async sellSys(
        tokenOut: Address,
        slippage: number,
        syTokenAmounts: RawTokenAmount<BigNumberish>[]
    ): Promise<TokenOutput[]>;
    async sellSys(
        tokenOut: Address,
        slippage: number,
        input: { sys: Address[]; netSyIns: BigNumberish[] } | RawTokenAmount<BigNumberish>[]
    ): Promise<TokenOutput[]> {
        const syTokenAmounts = Array.isArray(input)
            ? input
            : toArrayOfStructures({ token: input.sys, amount: input.netSyIns });
        return this.sellSysImpl(tokenOut, slippage, syTokenAmounts);
    }

    private async sellSysImpl(
        tokenOut: Address,
        slippage: number,
        syTokenAmounts: RawTokenAmount<BigNumberish>[]
    ): Promise<TokenOutput[]> {
        const syAddresses = new Set(syTokenAmounts.map(({ token }) => token)).values();
        const syData = new Map(
            await Promise.all(
                Array.from(syAddresses, async (addr) => {
                    const syEntity = new SyEntity(addr, this.entityConfig);
                    const outputTokens = await syEntity.getTokensOut();
                    const result = [addr, { syEntity, outputTokens }] as const;
                    return result;
                })
            )
        );

        const outputs = await Promise.all(
            syTokenAmounts.map(async (tokenAmount) => {
                const curSyData = syData.get(tokenAmount.token)!;
                const res = await this.outputParams(tokenAmount, tokenOut, curSyData.outputTokens, true, slippage, {
                    syEntity: curSyData.syEntity,
                });
                if (res === undefined) {
                    throw NoRouteFoundError.action('sell sy', tokenAmount.token, tokenOut);
                }

                return res;
            })
        );

        return outputs.map(({ output }) => output);
    }
}
