import { ChainId, filterUndefinedFields, getContractAddresses, BN, Address, toAddress } from '../../../common';
import {
    AggregatorHelper,
    AggregatorResult,
    MakeCallParams,
    AggregatorHelperError,
    SwapType,
    SwapData,
} from './AggregatorHelper';
import { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import rateLimit from 'axios-rate-limit';
import { wrapMakeCall } from './wrapMakeCall';
import { PendleSdkErrorParams, WrappedAxiosError } from '../../../errors';

/*
We don't use external tool to keep it small.
So here is a script to extract this type from their site (https://docs.1inch.io/docs/aggregation-protocol/api/swagger)
Just past it into the console.

var path = '#operations-Swap-ExchangeController_getSwap .table-container';
var fields = Array.from(document.querySelector(path).querySelectorAll('tbody > tr')).map((elm) => {
  const firstCell = elm.children[0];
  const name = firstCell.querySelector('.parameter__name').innerText.split(/\s/)[0];
  const isRequired = firstCell.querySelectorAll('.required').length > 0;
  const type = firstCell.querySelector('.parameter__type').innerText || 'number';
  return {name, isRequired, type};
}).map(({ name, isRequired, type}) => `  ${name}${isRequired ? '' : '?'}: ${type};`).join('\n');

var iface = `interface OneInchSwapAPIQueryParams = {\n${fields}\n};`
copy(iface);
iface;
 */
export type OneInchSwapAPIQueryParams = {
    src: Address;
    dst: Address;
    amount: string;
    from: Address;
    slippage: number;
    protocols?: string;
    fee?: string;
    disableEstimate?: boolean;
    permit?: string;
    // burnChi?: boolean;
    includeTokensInfo?: boolean;
    includeProtocols?: boolean;
    compatibility?: boolean;
    allowPartialFill?: boolean;
    parts?: number;
    mainRouteParts?: number;
    connectorTokens?: number;
    complexityLevel?: number;
    gasLimit?: number;
    gasPrice?: number;
    referrer?: Address;
    receiver?: Address;
};

/**
 * @privateRemarks
 * This one is from the example result with some editing.
 */
export type OneInchSwapAPI200Result = {
    fromToken: {
        symbol: string;
        name: string;
        address: string;
        decimals: 0;
        logoURI: string;
    };
    toToken: {
        symbol: string;
        name: string;
        address: string;
        decimals: 0;
        logoURI: string;
    };
    // toTokenAmount: string;
    // fromTokenAmount: string;
    toAmount: string;
    protocols: string[];
    tx: {
        from: string;
        to: string;
        data: string;
        value: string;
        gasPrice: string;
        gas: string;
    };
};

export type OneInchSwapAPI400ErrorData = {
    statusCode: 400;
    error: 'Bad Request';
    description: string;
    requestId: string;
    // no need for meta
};

export type OneInchAggregatorHelperParams = {
    chainId: ChainId;
    customHeader?: Record<string, string>;
    apiParamsOverrides?: Partial<OneInchSwapAPIQueryParams>;
    axios?: AxiosInstance;
    apiUrl?: string;

    /**
     * External router to send call.
     * Default to 1inch's AggregationRouterV5 ('0x1111111254EEB25477B68fb85Ed929f73A960582')
     */
    extRouter?: Address;

    liquiditySourcesProvider?(instance: OneInchAggregatorHelper): Promise<string[]>;
};

export type OneInchLiquidtySourcesResult = {
    protocols: {
        id: string;
        // No need for the other metadata
    }[];
};

export class OneInchAggregatorHelperError extends AggregatorHelperError {
    constructor(message: string, params?: PendleSdkErrorParams) {
        super(`1inch aggregator error: ${message}`, params);
    }
}

export class OneInchAggregatorHelperAxiosError extends WrappedAxiosError {
    constructor(readonly cause: AxiosError) {
        super('1inch aggregator axios error', cause);
    }
}

export class OneInchAggregatorHelperSwapAPI400Error extends OneInchAggregatorHelperError {
    constructor(readonly data: OneInchSwapAPI400ErrorData, params?: PendleSdkErrorParams) {
        super(data.description, params);
    }
}

export class OneInchAggregatorResult implements AggregatorResult {
    readonly outputAmount: BN;
    readonly needScale: boolean;
    constructor(
        readonly queryParams: OneInchSwapAPIQueryParams,
        readonly data: OneInchSwapAPI200Result,
        readonly params: {
            extRouter: Address;
            needScale: boolean;
        }
    ) {
        // this.outputAmount = BN.from(data.toTokenAmount);
        this.outputAmount = BN.from(data.toAmount);
        this.needScale = params.needScale;
    }

    getSwapType() {
        return SwapType.ONE_INCH;
    }

    createSwapData({ needScale }: { needScale: boolean }): SwapData {
        if (needScale !== this.needScale) {
            // If this error is thrown, something is wrong happend to the SDK's Routing algo.
            throw new OneInchAggregatorHelperError('Mismatch needScale param');
        }
        return {
            swapType: SwapType.ONE_INCH,
            // default to fromAddress as convention here https://docs.1inch.io/docs/aggregation-protocol/api/swagger
            extRouter: this.params.extRouter,
            extCalldata: this.data.tx.data,
            needScale,
        };
    }
}

export class OneInchAggregatorHelper implements AggregatorHelper<true> {
    static readonly OneInchAggregationRouterV5 = toAddress('0x1111111254EEB25477B68fb85Ed929f73A960582');

    readonly chainId: ChainId;
    readonly axios: AxiosInstance;
    readonly customHeader: Record<string, string>;
    readonly apiParamsOverrides?: Partial<OneInchSwapAPIQueryParams>;
    readonly apiUrl: string;
    readonly extRouter: Address;
    readonly liquiditySourcesProvider: (instance: OneInchAggregatorHelper) => Promise<string[]>;

    constructor(params: OneInchAggregatorHelperParams) {
        this.chainId = params.chainId;
        this.axios = params.axios ?? axios;
        this.customHeader = params.customHeader ?? {};
        this.apiParamsOverrides = params.apiParamsOverrides;
        this.apiUrl = params.apiUrl ?? 'https://api.1inch.dev/swap/v5.2';
        this.extRouter = params.extRouter ?? OneInchAggregatorHelper.OneInchAggregationRouterV5;
        this.liquiditySourcesProvider =
            params.liquiditySourcesProvider?.bind(params) ?? OneInchAggregatorHelper.provideCachedLiquiditySources;
    }

    public static create(chainId: ChainId, apiKey: string, apiRPS = 1): OneInchAggregatorHelper {
        return new OneInchAggregatorHelper(OneInchAggregatorHelper.buildCreateParams(chainId, apiKey, apiRPS));
    }

    public static buildCreateParams(
        chainId: ChainId,
        apiKey: string,
        apiRPS: number,
        optionalParams?: Partial<OneInchAggregatorHelperParams>
    ): OneInchAggregatorHelperParams {
        return {
            chainId: chainId,
            customHeader: {
                Authorization: `Bearer ${apiKey}`,
            },
            axios: rateLimit(axios.create(), {
                maxRequests: 1,
                perMilliseconds: Math.max(1100, 1000 * (1 / apiRPS)), // TODO: Hack as exactly 1RPS didn't work during testing. Should be removed soon.
            }),
            ...optionalParams,
        };
    }

    getSwapUrl() {
        return `${this.apiUrl}/${this.chainId}/swap`;
    }

    getLiquiditySourcesUrl() {
        return `${this.apiUrl}/${this.chainId}/liquidity-sources`;
    }

    async makeCall(...params: MakeCallParams): Promise<AggregatorResult> {
        return wrapMakeCall(this, params, (...fixedParams) => this.make1InchCall(...fixedParams));
    }

    private async make1InchCall(...params: MakeCallParams): Promise<AggregatorResult> {
        const queryParams = await this.getOverriddenQueryParams(params);
        const [, , , { needScale = false } = {}] = params;

        const config: AxiosRequestConfig = {
            params: queryParams,
            url: this.getSwapUrl(),
            method: 'get',
            headers: this.customHeader,
        };

        // if (process.env.NODE_ENV !== 'production') {
        //     console.log('Making request', this.axios.getUri(config));
        // }

        try {
            const { data }: { data: OneInchSwapAPI200Result } = await this.axios.request(config);
            return new OneInchAggregatorResult(queryParams, data, {
                extRouter: this.extRouter,
                needScale: needScale,
            });
        } catch (e: unknown) {
            // https://docs.1inch.io/docs/aggregation-protocol/api/swagger
            if (axios.isAxiosError(e) && e.response?.status === 400) {
                const data = e.response.data as OneInchSwapAPI400ErrorData;
                throw new OneInchAggregatorHelperSwapAPI400Error(data);
            }
            if (axios.isAxiosError(e)) {
                throw new OneInchAggregatorHelperAxiosError(e);
            }
            throw new OneInchAggregatorHelperError('unknown error', { cause: e });
        }
    }

    async getBaseQueryParams([
        { token: tokenIn, amount: amountIn },
        tokenOut,
        slippage,
        params,
    ]: MakeCallParams): Promise<OneInchSwapAPIQueryParams> {
        const { PENDLE_SWAP, ROUTER } = getContractAddresses(this.chainId);
        slippage *= 100;
        if (slippage > 50) {
            // Source: https://docs.1inch.io/docs/aggregation-protocol/api/swap-params
            throw new OneInchAggregatorHelperError('1inch does not accept slippage greater than 50%');
        }
        return {
            src: tokenIn,
            dst: tokenOut,
            amount: String(amountIn),
            from: PENDLE_SWAP,
            receiver: params?.aggregatorReceiver ?? ROUTER,
            slippage: slippage,
            disableEstimate: true,
            protocols: (await this.getLiquiditySources({ needScale: params?.needScale ?? false })).join(','),
        };
    }

    async getOverriddenQueryParams(params: MakeCallParams): Promise<OneInchSwapAPIQueryParams> {
        return {
            ...(await this.getBaseQueryParams(params)),
            ...filterUndefinedFields(this.apiParamsOverrides ?? {}),
        };
    }

    async getLiquiditySources(params: { needScale: boolean }): Promise<string[]> {
        const liquiditySources = await this.liquiditySourcesProvider(this);
        return liquiditySources.filter(params.needScale ? this.testValidProtocolIdForScaling.bind(this) : () => true);
    }

    protected testValidProtocolIdForScaling(liquiditySourceProtocolId: string): boolean {
        return !/LIMIT_ORDER|PMM/.test(liquiditySourceProtocolId);
    }

    static cachedLiquiditySources = new Map<ChainId, Promise<string[]>>();
    /**
     * @remarks
     * This cache (without expiry) is introduced to avoid calling the `liquiditySources` endpoint lots
     * of time.
     *
     * The routing algorithm will call {@link AggregatorHelper#makeCall} a lot.
     * As {@link OneInchAggregatorHelper#makeCall} depend on {@link OneInchAggregatorHelper#getLiquiditySources},
     * and liquidity sources is is very unlikely to change (and should be the
     * same accross multiple call), the liquidity sources should be cache.
     *
     * To invalidate the cache, simply clear this map.
     *
     * But for better behaviour customization, it is recommended to pass in a
     * custom {@link OneInchAggregatorHelperParams#liquiditySourcesProvider}.
     */
    static provideCachedLiquiditySources(this: void, instance: OneInchAggregatorHelper): Promise<string[]> {
        const res = OneInchAggregatorHelper.cachedLiquiditySources.get(instance.chainId);
        if (res != undefined) return res;
        const fetchLiquiditySourcesPromise = instance.axios
            .request<OneInchLiquidtySourcesResult>({
                url: instance.getLiquiditySourcesUrl(),
                headers: instance.customHeader,
            })
            .then(({ data }) => data.protocols.map(({ id }) => id));
        OneInchAggregatorHelper.cachedLiquiditySources.set(instance.chainId, fetchLiquiditySourcesPromise);
        return fetchLiquiditySourcesPromise;
    }
}
