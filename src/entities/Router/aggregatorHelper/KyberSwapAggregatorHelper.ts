/**
 * The specification for the KyberSwap aggregator API can be found [here][KyberSwapAPI].
 * In particular, the **Legacy** endpoint is used instead of the new one.
 * The reason is because we want to get the encoded data in one call instead of 2 separated calls.
 *
 * As KyberSwap updated their new new server, the error messages are also revamped. This lead to
 * the old endpoint having the same errors as the new one, but that is not specified in the
 * new docs.
 *
 * [KyberSwapAPI]: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification/evm-swaps
 */
import { BigNumberish, BytesLike, BigNumber as BN } from 'ethers';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
    CHAIN_ID_MAPPING,
    ChainId,
    Address,
    areSameAddresses,
    isNativeToken,
    toAddress,
    NATIVE_ADDRESS_0xEE,
    RawTokenAmount,
    If,
    getContractAddresses,
    filterUndefinedFields,
} from '../../../common';
import { PendleSdkError, PendleSdkErrorParams } from '../../../errors';
import {
    AggregatorHelper,
    AggregatorResult,
    SwapType,
    SwapData,
    createNoneAggregatorResult,
    createETH_WETHAggregatorResult,
    AggregatorHelperError,
} from './AggregatorHelper';

export type KyberAPIParamsOverrides = {
    saveGas?: '0' | '1';
    gasInclude?: '0' | '1';
    useMeta?: boolean;
    clientData?: { source: string };
    deadline?: string;

    /**
     * Comma-separated sources
     */
    excludedSources?: string;
};

export type KyberAPIParams = KyberAPIParamsOverrides & {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: string;
    to: Address;
    slippageTolerance: number;
};

const KYBER_API = {
    [CHAIN_ID_MAPPING.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID_MAPPING.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://aggregator-api.stg.kyberengineering.io/mumbai/route/encode',
    [CHAIN_ID_MAPPING.ARBITRUM]: 'https://aggregator-api.kyberswap.com/arbitrum/route/encode',
    [CHAIN_ID_MAPPING.BSC]: 'https://aggregator-api.kyberswap.com/bsc/route/encode',
} as const;

function isKyberSupportedChain(chainId: ChainId): chainId is keyof typeof KYBER_API {
    return chainId in KYBER_API;
}

export type KyberHelperConfig = {
    chainId: ChainId;
    apiParamsOverrides?: Partial<KyberAPIParamsOverrides>;
    axios?: AxiosInstance;
};

type RawKybercallData<HasEncodedData extends boolean = boolean> = {
    amountInUsd: number;
    amountOutUsd: number;
    outputAmount: BigNumberish;
    encodedSwapData: If<HasEncodedData, BytesLike>;
    routerAddress: string;
};

// Workaround with type alias, because of TypeScript _current_
// [_Design limitation_](https://github.com/microsoft/TypeScript/issues/53453)
type RawKybercallDataWithEncodedSwapData = RawKybercallData<true>;
function rawKybercallDataHasEncodedData(data: RawKybercallData): data is RawKybercallDataWithEncodedSwapData {
    return data.encodedSwapData !== undefined;
}

export class KyberSwapAggregatorHelperError extends AggregatorHelperError {}

export class UnknownKyberSwapAggregatorHelperError extends KyberSwapAggregatorHelperError {
    constructor(params?: PendleSdkErrorParams) {
        const cause = params?.cause;
        super(`KyberSwap: ${cause instanceof Error ? cause.message : 'unknown error'}`, params);
    }
}

export enum KyberSwapAggergatorHelperRequestErrorCode {
    MALFORMED_QUERY_PARAMS = 4001,
    MALFORMED_REQUEST_BODY = 4002,
    FEE_AMOUNT_GT_AMOUNT_IN = 4005,
    FEE_AMOUNT_GT_AMOUNT_OUT = 4007,
    ROUTE_NOT_FOUND = 4008,
    AMOUNT_IN_GT_MAX_ALLOWED = 4009,
    NO_ELIGIBLE_POOL = 4010,
    TOKEN_NOT_FOUND = 4011,
    NO_CONFIGURED_WETH = 4221,
}

export const KYBER_SWAP_REQUEST_ERROR_STATUS = [400, 422];

export type KyberSwapErrorData = {
    code: KyberSwapAggergatorHelperRequestErrorCode;
    message: string;
    requestId: string;
};

export function checkKyberSwapErrorData(errorData: unknown): errorData is KyberSwapErrorData {
    if (typeof errorData !== 'object') return false;
    if (errorData == null) return false;
    if (!('message' in errorData) || typeof errorData.message !== 'string') return false;
    if (!('requestId' in errorData) || typeof errorData.requestId !== 'string') return false;
    if (!('code' in errorData) || typeof errorData.code !== 'number') return false;
    if (!Object.values(KyberSwapAggergatorHelperRequestErrorCode).includes(errorData.code)) return false;
    return true;
}

/**
 * @remarks
 * Response error, as specified for https://aggregator-api.kyberswap.com/{chain}/api/v1/routes endpoint.
 * However, the legacy one now is also using the error.
 */
export class KyberSwapAggregatorHelperRequestError extends KyberSwapAggregatorHelperError {
    constructor(
        readonly code: KyberSwapAggergatorHelperRequestErrorCode,
        readonly requestErrorMessage: string,
        readonly requestId: string,
        readonly requestData: KyberAPIParams,
        params?: PendleSdkErrorParams
    ) {
        super(`KyberSwap request error: ${requestErrorMessage}`, params);
    }
}

export class KyberSwapAggregatorResult implements AggregatorResult {
    readonly amountInUsd?: number | undefined;
    readonly amountOutUsd?: number | undefined;
    readonly outputAmount: BN;

    // Field names reflect Kyberswap rest API.
    readonly encodedSwapData: BytesLike;
    readonly routerAddress: Address;

    constructor(params: {
        amountInUsd: number | undefined;
        amountOutUsd: number | undefined;
        outputAmount: BigNumberish;
        encodedSwapData: BytesLike;
        routerAddress: Address;
    }) {
        this.amountInUsd = params.amountInUsd;
        this.amountOutUsd = params.amountOutUsd;
        this.outputAmount = BN.from(params.outputAmount);
        this.encodedSwapData = params.encodedSwapData;
        this.routerAddress = params.routerAddress;
    }

    getSwapType() {
        return SwapType.KYBERSWAP;
    }

    createSwapData({ needScale }: { needScale: boolean }): SwapData {
        return {
            swapType: SwapType.KYBERSWAP,
            extRouter: this.routerAddress,
            extCalldata: this.encodedSwapData,
            needScale,
        };
    }
}

export class KyberSwapAggregatorHelper implements AggregatorHelper<true> {
    readonly chainId: ChainId;
    readonly routerAddress: Address;
    readonly apiParamsOverrides?: KyberAPIParamsOverrides;
    readonly axios: AxiosInstance;

    /**
     * @param routerAddress the address of the router (that is, the address that can be passed to {@link Router})
     * @param config
     */
    constructor(routerAddress: Address, config: KyberHelperConfig) {
        this.routerAddress = routerAddress;
        this.chainId = config.chainId;
        this.apiParamsOverrides = config.apiParamsOverrides;
        this.axios = config.axios ?? axios;
    }

    static getKyberSwapAggregatorHelper(config: KyberHelperConfig): KyberSwapAggregatorHelper {
        const routerAddress = getContractAddresses(config.chainId).ROUTER;
        return new KyberSwapAggregatorHelper(routerAddress, config);
    }

    /**
     * Make a kyber call
     * @remarks
     * - If `input.token` is the same as `output`, no actual call is done.
     * We will just return the input amount.
     * - If `input.token` is a native token (it is checked by calling {@link isNativeToken}),
     * it will be convert to {@link NATIVE_ADDRESS_0xEE} before calling.
     *
     * @param input - the pair of the token address with the desired amount to trade.
     * @param tokenOut - the destination token address
     * @param slippage - slippage, from [0, 0.2]
     * @param params - the additional parameters for kybercall.
     * @param params.receiver - the receiver of the output token. If not specified, the router will be the receiver.
     * @returns
     * {@link KybercallData} is returned if there is a route to trade via Kyberswap.
     * If there is no route, `undefined` is returned.
     * If `input.token` is the same as `output`, no actual call is done.
     */
    async makeCall(
        { token: tokenIn, amount }: RawTokenAmount<BigNumberish>,
        tokenOut: Address,
        slippage: number,
        { aggregatorReceiver = this.routerAddress }: { aggregatorReceiver?: Address } = {}
    ): Promise<AggregatorResult> {
        if (!isKyberSupportedChain(this.chainId)) {
            throw new PendleSdkError(`Chain ${this.chainId as number} is not supported for kybercall.`);
        }
        // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
        if (isNativeToken(tokenIn)) tokenIn = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(tokenOut)) tokenOut = NATIVE_ADDRESS_0xEE;

        if (areSameAddresses(tokenIn, tokenOut)) {
            return createNoneAggregatorResult(amount);
        }

        const patchedResult = await this.patchETH_wETH({ token: tokenIn, amount }, tokenOut, slippage, {
            receiver: aggregatorReceiver,
        });
        if (patchedResult) return patchedResult;

        const slippageTolerance = Math.min(Math.trunc(10000 * slippage), 2000);

        // Using type here because Rest API doesn't have type
        const kyberAPIParams: KyberAPIParams = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: BN.from(amount).toString(),
            to: aggregatorReceiver,
            slippageTolerance,
            useMeta: false,
            saveGas: '1',
            gasInclude: '1',
            clientData: { source: 'Pendle' },
            deadline: String(2 ** 31 - 1),
            excludedSources: 'kyberswap-limit-order,rfq',
            ...filterUndefinedFields(this.getApiParamsOverrides()),
        };

        const config: AxiosRequestConfig = {
            params: kyberAPIParams,
            headers: { 'Accept-Version': 'Latest' },
            url: KYBER_API[this.chainId],
            method: 'get',
        };

        // if (process.env.NODE_ENV !== 'production') {
        //     console.log('Making request', this.axios.getUri(config));
        // }

        try {
            const { data }: { data: RawKybercallData } = await this.axios.request(config);
            if (!rawKybercallDataHasEncodedData(data)) {
                throw new KyberSwapAggregatorHelperError('KyberSwap returned undefined encoded data');
            }
            return new KyberSwapAggregatorResult({
                ...data,
                routerAddress: toAddress(data.routerAddress),
            });
        } catch (e: unknown) {
            if (
                !axios.isAxiosError(e) ||
                e.response == undefined ||
                !KYBER_SWAP_REQUEST_ERROR_STATUS.includes(e.response.status)
            ) {
                throw new UnknownKyberSwapAggregatorHelperError({ cause: e });
            }
            const data = e.response.data;
            if (!checkKyberSwapErrorData(data)) {
                throw new UnknownKyberSwapAggregatorHelperError({ cause: e });
            }
            throw new KyberSwapAggregatorHelperRequestError(data.code, data.message, data.requestId, kyberAPIParams, {
                cause: e,
            });
        }
    }

    protected getApiParamsOverrides(): KyberAPIParamsOverrides {
        if (this.apiParamsOverrides) return this.apiParamsOverrides;
        const ans: KyberAPIParamsOverrides = {};
        if (this.chainId === CHAIN_ID_MAPPING.ARBITRUM) {
            ans.saveGas = '0';
            ans.gasInclude = '1';
        }
        return ans;
    }

    private async patchETH_wETH(
        { token: tokenIn, amount }: RawTokenAmount<BigNumberish>,
        tokenOut: Address,
        _slippage: number,
        _params: { receiver?: Address } = {}
    ): Promise<AggregatorResult | undefined> {
        const wrappedNative = getContractAddresses(this.chainId).WRAPPED_NATIVE;
        for (const [tokenA, tokenB] of [
            [tokenIn, tokenOut],
            [tokenOut, tokenIn],
        ]) {
            if (isNativeToken(tokenA) && areSameAddresses(tokenB, wrappedNative)) {
                return Promise.resolve(createETH_WETHAggregatorResult(amount));
            }
        }
    }
}
