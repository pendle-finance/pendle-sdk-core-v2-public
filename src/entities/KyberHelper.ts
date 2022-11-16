import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber as BN } from 'ethers';
import axios from 'axios';
import { ERC20 } from './ERC20';
import { MulticallStaticParams } from '../contracts';
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
} from '../common';

// The type is only for documentation.

const KYBER_API = {
    [CHAIN_ID_MAPPING.ETHEREUM]: 'https://aggregator-api.kyberswap.com/ethereum/route/encode',
    [CHAIN_ID_MAPPING.AVALANCHE]: 'https://aggregator-api.kyberswap.com/avalanche/route/encode',
    [CHAIN_ID_MAPPING.FUJI]: 'https://aggregator-api.stg.kyberengineering.io/fuji/route/encode',
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
type RawKybercallData = {
    amountInUsd: number;
    amountOutUsd: number;
    outputAmount: BigNumberish;
    encodedSwapData: BytesLike;
    routerAddress: string; // the only different
};

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
     * @returns
     * {@link KybercallData} is returned if there is a route to trade via Kyberswap.
     * If there is no route, `undefined` is returned.
     * If `input.token` is the same as `output`, no actual call is done.
     */
    async makeCall(input: RawTokenAmount<BigNumberish>, output: Address): Promise<KybercallData | undefined> {
        if (!isKyberSupportedChain(this.chainId)) {
            throw new Error(`Chain ${this.chainId} is not supported for kybercall.`);
        }
        if (isSameAddress(input.token, output))
            return {
                outputAmount: input.amount,
                encodedSwapData: [],
                routerAddress: NATIVE_ADDRESS_0x00,
            };
        // Our contracts use zero address to represent ETH, but kyber uses 0xeee..
        if (isNativeToken(input.token)) input.token = NATIVE_ADDRESS_0xEE;
        if (isNativeToken(output)) output = NATIVE_ADDRESS_0xEE;

        // Using type here because Rest API doesn't have type
        const params: {
            tokenIn: Address;
            tokenOut: Address;
            amountIn: string;
            to: Address;
            slippageTolerance: number;
        } = {
            tokenIn: input.token,
            tokenOut: output,
            amountIn: BN.from(input.amount).toString(),
            to: this.routerAddress,
            // set the slippage to 20% since we already enforced the minimum output in our contract
            slippageTolerance: 2_000,
        };

        try {
            const { data }: { data: RawKybercallData } = await axios.get(KYBER_API[this.chainId], {
                params,
                headers: { 'Accept-Version': 'Latest' },
            });
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
            const decimals = await new ERC20(srcTokenAddress, this.networkConnection).decimals(params);
            const testAmount = BN.from(10).pow(decimals).mul(100);
            const kybercallData = await this.makeCall({ token: srcTokenAddress, amount: testAmount }, dstTokenAddress);
            const swappable = kybercallData != undefined;
            this.swappablePairs.set(key, { swappable, checkedAtTimestamp: Date.now() });
            return swappable;
        })();

        this.swappablePairs.set(key, { pendingResult: res });
        return res;
    }
}
