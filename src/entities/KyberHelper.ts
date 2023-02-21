import { BigNumberish, BytesLike, Contract } from 'ethers';
import { BigNumber as BN } from 'ethers';
import axios from 'axios';
import { createERC20 } from './erc20';
import { MulticallStaticParams, IWETH, IWETH_ABI } from '../contracts';
import {
    CHAIN_ID_MAPPING,
    ChainId,
    Address,
    isSameAddress,
    isNativeToken,
    toAddress,
    NATIVE_ADDRESS_0x00,
    NATIVE_ADDRESS_0xEE,
    NetworkConnection,
    copyNetworkConnection,
    RawTokenAmount,
    If,
} from '../common';
import { PendleSdkError } from '../errors';

// The type is only for documentation.

const KYBER_API = {
    [CHAIN_ID_MAPPING.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID_MAPPING.AVALANCHE]: 'https://aggregator-api.kyberswap.com/avalanche/route/encode',
    [CHAIN_ID_MAPPING.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
    [CHAIN_ID_MAPPING.MUMBAI]: 'https://aggregator-api.stg.kyberengineering.io/mumbai/route/encode',
} as const;

function isKyberSupportedChain(chainId: ChainId): chainId is keyof typeof KYBER_API {
    return chainId in KYBER_API;
}

export type SwappablePairResult = {
    swappable: boolean;
    checkedAtTimestamp: number;
};

/**
 * The state of the kyber helper than is an POJO and ready to be stored elsewhere.
 */
export type KyberState = {
    swappablePairs: (SwappablePairResult & {
        srcTokenAddress: Address;
        dstTokenAddress: Address;
    })[];
};

/**
 * _Core_ configuration for kyber helper.
 */
export type KyberHelperCoreConfig = {
    state?: KyberState;

    /**
     * Max timeout to cache, in milliseconds.
     */
    cacheTimeout_ms?: number;
};

export type KyberHelperConfig = NetworkConnection &
    KyberHelperCoreConfig & {
        chainId: ChainId;
    };

/**
 * Here are the extracted fields from the kyber aggregator API.
 *
 * https://kyber-network.stoplight.io/docs/api-docs/5ac2df86149df-get-swap-info-with-encoded-data
 *
 * We only extract some interesting fields.
 */
export type KybercallData = {
    // can be undefined in case we didn't use KyberSwap
    // TODO actually made these field defined, and just assign 0 when we don't use it.
    amountInUsd?: number;
    amountOutUsd?: number;
    outputAmount: BigNumberish;
    encodedSwapData: BytesLike;
    routerAddress: Address;
};

/**
 * These are similar to {@link KybercallData}, but with _raw_ fields type.
 */
type RawKybercallData<HasEncodedData extends boolean = boolean> = {
    amountInUsd: number;
    amountOutUsd: number;
    outputAmount: BigNumberish;
    encodedSwapData: If<HasEncodedData, BytesLike>;
    routerAddress: string; // the only different
};

function rawKybercallDataHasEncodedData(data: RawKybercallData): data is RawKybercallData<true> {
    return data.encodedSwapData !== undefined;
}

// TODO automate getting the addresses.
const HARDCODE_USDC_FOR_CHAIN = {
    [CHAIN_ID_MAPPING.ETHEREUM]: toAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    [CHAIN_ID_MAPPING.AVALANCHE]: toAddress('0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'),

    // These are from contract package deployment
    [CHAIN_ID_MAPPING.FUJI]: toAddress('0xc2A6b8d7d0FAB3749A6Bda84cEdb58D2d58f045e'),
    [CHAIN_ID_MAPPING.MUMBAI]: toAddress('0x5Ea8c8e02c2D413165C1ADcBb6916B0851f6cd73'),
} as const;

const USDC_DECIMALS = 6;

export class KyberHelper {
    static readonly DEFAULT_CONFIG_PARAM = {
        // 1 day
        cacheTimeout_ms: 24 * 60 * 60 * 1000,
    };

    readonly chainId: ChainId;
    readonly networkConnection: NetworkConnection;
    readonly routerAddress: Address;
    readonly cacheTimeout_ms: number;

    /**
     * A map that cache the result for swappable pairs.
     * @remarks
     * The key is concatenation of 2 addresses, as Javascript's Map
     * currently does not have a way to customize the key type.
     *
     * For the value type, it can also be a `Promise` to avoid
     * sending multiple call at the same time.
     */
    protected swappablePairs = new Map<
        `${Address}-${Address}`,
        SwappablePairResult | { pendingResult: Promise<boolean> }
    >();

    /**
     * @param routerAddress the address of the router (that is, the address that can be passed to {@link Router})
     * @param config
     */
    constructor(routerAddress: Address, config: KyberHelperConfig) {
        const { cacheTimeout_ms: swappablePairsExpirationTimeout_ms, state } = {
            ...KyberHelper.DEFAULT_CONFIG_PARAM,
            ...config,
        };

        this.routerAddress = routerAddress;
        this.networkConnection = copyNetworkConnection(config);
        this.chainId = config.chainId;
        this.cacheTimeout_ms = swappablePairsExpirationTimeout_ms;
        if (state != undefined) {
            this.state = state;
        }
    }

    set state(value: KyberState) {
        if (this.swappablePairs.size > 0) {
            this.swappablePairs = new Map();
        }
        const currentTimestamp = Date.now();
        for (const { srcTokenAddress, dstTokenAddress, swappable, checkedAtTimestamp } of value.swappablePairs) {
            if (checkedAtTimestamp + this.cacheTimeout_ms < currentTimestamp) {
                continue;
            }
            this.swappablePairs.set(`${srcTokenAddress}-${dstTokenAddress}`, {
                swappable,
                checkedAtTimestamp,
            });
        }
    }

    get state(): KyberState {
        const swappablePairs: KyberState['swappablePairs'] = Array.from(
            this.swappablePairs.entries(),
            ([pair, value]) => {
                if ('pendingResult' in value) return [];
                const { swappable, checkedAtTimestamp } = value;
                if (checkedAtTimestamp + this.cacheTimeout_ms >= Date.now()) {
                    return [];
                }
                const [srcTokenAddress, dstTokenAddress] = pair.split('-') as [Address, Address];
                return [{ srcTokenAddress, dstTokenAddress, swappable, checkedAtTimestamp }];
            }
        ).flat();

        return {
            swappablePairs,
        };
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
     * @param output - the destination token address
     * @param slippage - slippage, from [0, 0.2]
     * @param params - the additional parameters for kybercall.
     * @param params.receiver - the receiver of the output token. If not specified, the router will be the receiver.
     * @returns
     * {@link KybercallData} is returned if there is a route to trade via Kyberswap.
     * If there is no route, `undefined` is returned.
     * If `input.token` is the same as `output`, no actual call is done.
     */
    async makeCall(
        { token, amount }: RawTokenAmount<BigNumberish>,
        output: Address,
        slippage: number,
        { receiver = this.routerAddress }: { receiver?: Address } = {}
    ): Promise<KybercallData | undefined> {
        if (!isKyberSupportedChain(this.chainId)) {
            throw new PendleSdkError(`Chain ${this.chainId} is not supported for kybercall.`);
        }
        // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
        if (isNativeToken(token)) token = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(output)) output = NATIVE_ADDRESS_0xEE;

        if (isSameAddress(token, output)) {
            const result = {
                outputAmount: amount,
                encodedSwapData: [],
                routerAddress: NATIVE_ADDRESS_0x00,
            } as const;

            return result;
        }
        const patchedResult = await this.patchETH_wETH({ token, amount }, output, slippage, {
            receiver,
        });
        if (patchedResult) return patchedResult;

        const slippageTolerance = Math.min(Math.trunc(10000 * slippage), 2000);

        // Using type here because Rest API doesn't have type
        const kyberCallParams: {
            tokenIn: Address;
            tokenOut: Address;
            amountIn: string;
            to: Address;
            slippageTolerance: number;
            useMeta: boolean;
            saveGas: '0' | '1';
            gasInclude: '0' | '1';
            clientData: { source: string };
        } = {
            tokenIn: token,
            tokenOut: output,
            amountIn: BN.from(amount).toString(),
            to: receiver,
            slippageTolerance,
            useMeta: false,
            saveGas: '1',
            gasInclude: '1',
            clientData: { source: 'Pendle' },
        };

        const config = {
            params: kyberCallParams,
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
            return {
                ...data,
                routerAddress: toAddress(data.routerAddress),
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Check if two tokens are swappable via KyberSwap.
     * @remarks
     * Before making kyber call (via {@link KyberHelper#makeCall}), this method
     * will look up the cache result. The result will be cached for
     * {@link KyberHelper#cacheTimeout_ms} milliseconds.
     *
     * To find the amount for checking, the decimals of `srcTokenAddress` will
     * first be fetched.  Then we try to trade 100 source tokens via KyberSwap.
     * As the operation for find the decimals is an RPC call, this method cache
     * the swap result to reduce the amount of calls over the network.
     *
     * @param srcTokenAddress - the address of the source token.
     * @param dstTokenAddress - the address of the destination token.
     * @param params - the additional parameters for read method.
     * @returns true if there is a route to swap from the source token to the
     * destination token.
     */
    async checkSwappablePair(
        srcTokenAddress: Address,
        dstTokenAddress: Address,
        params?: MulticallStaticParams
    ): Promise<boolean> {
        // force lowercase
        srcTokenAddress = toAddress(srcTokenAddress);
        dstTokenAddress = toAddress(dstTokenAddress);
        const key = `${srcTokenAddress}-${dstTokenAddress}` as const;
        const cachedResult = this.swappablePairs.get(key);
        if (cachedResult && 'pendingResult' in cachedResult) {
            return cachedResult.pendingResult;
        }
        if (cachedResult && cachedResult.checkedAtTimestamp + this.cacheTimeout_ms < Date.now()) {
            return cachedResult.swappable;
        }

        const res = (async () => {
            const decimals = await createERC20(srcTokenAddress, { ...this.networkConnection, ...params }).decimals();
            const testAmount = BN.from(10).pow(decimals).mul(100);
            const kybercallData = await this.makeCall(
                { token: srcTokenAddress, amount: testAmount },
                dstTokenAddress,
                // default slippage is 20%
                0.2
            );
            const swappable = kybercallData != undefined;
            this.swappablePairs.set(key, { swappable, checkedAtTimestamp: Date.now() });
            return swappable;
        })();

        this.swappablePairs.set(key, { pendingResult: res });
        return res;
    }

    /**
     * TODO remove the below in the future.
     * This is just a workaround for a particular case of KyberSwap that failed, which is swapping ETH <-> WETH.
     */
    private static readonly WETHAddress = toAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    private static readonly WETH_ERC20 = new Contract(KyberHelper.WETHAddress, IWETH_ABI) as IWETH;
    private async patchETH_wETH(
        { token, amount }: RawTokenAmount<BigNumberish>,
        output: Address,
        _slippage: number,
        _params: { receiver?: Address } = {}
    ): Promise<KybercallData | undefined> {
        if (isNativeToken(token) && isSameAddress(output, KyberHelper.WETHAddress)) {
            return {
                routerAddress: KyberHelper.WETHAddress,
                outputAmount: amount,
                encodedSwapData: (await KyberHelper.WETH_ERC20.populateTransaction.deposit()).data!,
            };
        }
        if (isSameAddress(token, KyberHelper.WETHAddress) && isNativeToken(output)) {
            return {
                routerAddress: KyberHelper.WETHAddress,
                outputAmount: amount,
                encodedSwapData: (await KyberHelper.WETH_ERC20.populateTransaction.withdraw(0)).data!,
            };
        }
    }
}
