import { BigNumberish, BytesLike, BigNumber as BN } from 'ethers';
import axios from 'axios';
import {
    CHAIN_ID_MAPPING,
    ChainId,
    Address,
    isSameAddress,
    isNativeToken,
    toAddress,
    NATIVE_ADDRESS_0xEE,
    NetworkConnection,
    copyNetworkConnection,
    RawTokenAmount,
    If,
    getContractAddresses,
} from '../../../common';
import { PendleSdkError } from '../../../errors';
import {
    AggregatorHelper,
    AggregatorResult,
    SwapType,
    SwapData,
    createNoneAggregatorResult,
    createETH_WETHAggregatorResult,
} from './AggregatorHelper';

export type KyberAPIParams = {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: string;
    to: Address;
    slippageTolerance: number;
    useMeta: boolean;
    saveGas: '0' | '1';
    gasInclude: '0' | '1';
    clientData: { source: string };
};

const KYBER_API = {
    [CHAIN_ID_MAPPING.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID_MAPPING.AVALANCHE]: 'https://aggregator-api.kyberswap.com/avalanche/route/encode',
    [CHAIN_ID_MAPPING.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://aggregator-api.stg.kyberengineering.io/mumbai/route/encode',
    [CHAIN_ID_MAPPING.ARBITRUM]: 'https://aggregator-api.kyberswap.com/arbitrum/route/encode',
} as const;

function isKyberSupportedChain(chainId: ChainId): chainId is keyof typeof KYBER_API {
    return chainId in KYBER_API;
}

export type KyberHelperConfig = NetworkConnection & {
    chainId: ChainId;
};

type RawKybercallData<HasEncodedData extends boolean = boolean> = {
    amountInUsd: number;
    amountOutUsd: number;
    outputAmount: BigNumberish;
    encodedSwapData: If<HasEncodedData, BytesLike>;
    routerAddress: string;
};

function rawKybercallDataHasEncodedData(data: RawKybercallData): data is RawKybercallData<true> {
    return data.encodedSwapData !== undefined;
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

export class KyberSwapAggregatorHelper implements AggregatorHelper {
    readonly chainId: ChainId;
    readonly networkConnection: NetworkConnection;
    readonly routerAddress: Address;

    /**
     * @param routerAddress the address of the router (that is, the address that can be passed to {@link Router})
     * @param config
     */
    constructor(routerAddress: Address, config: KyberHelperConfig) {
        this.routerAddress = routerAddress;
        this.networkConnection = copyNetworkConnection(config);
        this.chainId = config.chainId;
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
    ): Promise<AggregatorResult | undefined> {
        if (!isKyberSupportedChain(this.chainId)) {
            throw new PendleSdkError(`Chain ${this.chainId} is not supported for kybercall.`);
        }
        // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
        if (isNativeToken(tokenIn)) tokenIn = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(tokenOut)) tokenOut = NATIVE_ADDRESS_0xEE;

        if (isSameAddress(tokenIn, tokenOut)) {
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
        };

        const config = {
            params: kyberAPIParams,
            headers: { 'Accept-Version': 'Latest' },
            url: KYBER_API[this.chainId],
            method: 'get',
        };

        // if (process.env.NODE_ENV !== 'production') {
        //     console.log('Making request', axios.getUri(config));
        // }

        try {
            const { data }: { data: RawKybercallData } = await axios(config);
            if (!rawKybercallDataHasEncodedData(data)) {
                return undefined;
            }
            return new KyberSwapAggregatorResult({
                ...data,
                routerAddress: toAddress(data.routerAddress),
            });
        } catch {
            return undefined;
        }
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
            if (isNativeToken(tokenA) && isSameAddress(tokenB, wrappedNative)) {
                return createETH_WETHAggregatorResult(amount);
            }
        }
    }
}
