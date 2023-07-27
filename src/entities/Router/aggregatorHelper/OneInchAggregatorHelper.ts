import { ChainId, filterUndefinedFields, getContractAddresses, BN, Address, toAddress } from '../../../common';
import {
    AggregatorHelper,
    AggregatorResult,
    MakeCallParams,
    AggregatorHelperError,
    SwapType,
    SwapData,
} from './AggregatorHelper';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import { wrapMakeCall } from './wrapMakeCall';
import { PendleSdkErrorParams } from '../../../errors';

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
    fromTokenAddress: Address;
    toTokenAddress: Address;
    amount: string;
    fromAddress: Address;
    slippage: number;
    protocols?: string;
    destReceiver?: Address;
    referrerAddress?: Address;
    fee?: string;
    disableEstimate?: boolean;
    permit?: string;
    compatibilityMode?: boolean;
    burnChi?: boolean;
    allowPartialFill?: boolean;
    parts?: number;
    mainRouteParts?: number;
    connectorTokens?: number;
    complexityLevel?: number;
    gasLimit?: number;
    gasPrice?: number;
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
    toTokenAmount: string;
    fromTokenAmount: string;
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
    apiParamsOverrides?: Partial<OneInchSwapAPIQueryParams>;
    axios?: AxiosInstance;
    apiUrl?: string;

    /**
     * External router to send call.
     * Default to 1inch's AggregationRouterV5 ('0x1111111254EEB25477B68fb85Ed929f73A960582')
     */
    extRouter?: Address;
};

export class OneInchAggregatorHelperError extends AggregatorHelperError {
    constructor(message: string, params?: PendleSdkErrorParams) {
        super(`1inch aggregator error: ${message}`, params);
    }
}
export class OneInchAggregatorHelperSwapAPI400Error extends OneInchAggregatorHelperError {
    constructor(readonly data: OneInchSwapAPI400ErrorData, params?: PendleSdkErrorParams) {
        super(data.description, params);
    }
}

export class OneInchAggregatorResult implements AggregatorResult {
    readonly outputAmount: BN;
    constructor(
        readonly queryParams: OneInchSwapAPIQueryParams,
        readonly data: OneInchSwapAPI200Result,
        readonly params: {
            extRouter: Address;
        }
    ) {
        this.outputAmount = BN.from(data.toTokenAmount);
    }

    getSwapType() {
        return SwapType.ONE_INCH;
    }

    createSwapData({ needScale }: { needScale: boolean }): SwapData {
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
    readonly apiParamsOverrides?: Partial<OneInchSwapAPIQueryParams>;
    readonly apiUrl: string;
    readonly extRouter: Address;

    constructor(params: OneInchAggregatorHelperParams) {
        this.chainId = params.chainId;
        this.axios = params.axios ?? axios;
        this.apiParamsOverrides = params.apiParamsOverrides;
        this.apiUrl = params.apiUrl ?? 'https://api.1inch.io/v5.0';
        this.extRouter = params.extRouter ?? OneInchAggregatorHelper.OneInchAggregationRouterV5;
    }

    getSwapUrl() {
        return `${this.apiUrl}/${this.chainId}/swap`;
    }

    async makeCall(...params: MakeCallParams): Promise<AggregatorResult> {
        return wrapMakeCall(this, params, (...fixedParams) => this.make1InchCall(...fixedParams));
    }

    private async make1InchCall(...params: MakeCallParams): Promise<AggregatorResult> {
        const queryParams = this.getOverriddenQueryParams(params);

        const config: AxiosRequestConfig = {
            params: queryParams,
            url: this.getSwapUrl(),
            method: 'get',
        };

        // if (process.env.NODE_ENV !== 'production') {
        //     console.log('Making request', this.axios.getUri(config));
        // }

        try {
            const { data }: { data: OneInchSwapAPI200Result } = await this.axios.request(config);
            return new OneInchAggregatorResult(queryParams, data, { extRouter: this.extRouter });
        } catch (e: unknown) {
            // https://docs.1inch.io/docs/aggregation-protocol/api/swagger
            if (axios.isAxiosError(e) && e.response?.status === 400) {
                const data = e.response.data as OneInchSwapAPI400ErrorData;
                throw new OneInchAggregatorHelperSwapAPI400Error(data);
            }
            throw new OneInchAggregatorHelperError('unknown error', { cause: e });
        }
    }

    getBaseQueryParams([
        { token: tokenIn, amount: amountIn },
        tokenOut,
        slippage,
        params,
    ]: MakeCallParams): OneInchSwapAPIQueryParams {
        const { PENDLE_SWAP, ROUTER } = getContractAddresses(this.chainId);
        slippage *= 100;
        if (slippage > 50) {
            // Source: https://docs.1inch.io/docs/aggregation-protocol/api/swap-params
            throw new OneInchAggregatorHelperError('1inch does not accept slippage greater than 50%');
        }
        return {
            fromTokenAddress: tokenIn,
            toTokenAddress: tokenOut,
            amount: String(amountIn),
            fromAddress: PENDLE_SWAP,
            destReceiver: params?.aggregatorReceiver ?? ROUTER,
            slippage: slippage,
            disableEstimate: true,
        };
    }

    getOverriddenQueryParams(params: MakeCallParams): OneInchSwapAPIQueryParams {
        return {
            ...this.getBaseQueryParams(params),
            ...filterUndefinedFields(this.apiParamsOverrides ?? {}),
        };
    }
}
