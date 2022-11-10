import { Address, RawTokenAmount, ChainId, NetworkConnection, MulticallStaticParams } from '../types';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { isKyberSupportedChain, isSameAddress, isNativeToken, copyNetworkConnection, toAddress } from './helper';
import { NATIVE_ADDRESS_0xEE, NATIVE_ADDRESS_0x00, KYBER_API } from '../constants';
import axios from 'axios';
import { ERC20 } from './ERC20';

type SwappablePairResult = {
    swappable: boolean;
    checkedAtTimestamp: number;
};

export type KyberState = {
    swappablePairs: (SwappablePairResult & {
        srcTokenAddress: Address;
        dstTokenAddress: Address;
    })[];
};

export type KyberHelperCoreConfig = {
    state?: KyberState;
    cacheTimeout_ms?: number;
};

export type KyberHelperConfig = NetworkConnection & KyberHelperCoreConfig;

export type KybercallData = {
    amountInUsd?: number;
    amountOutUsd?: number;
    outputAmount: BigNumberish;
    encodedSwapData?: BytesLike;
    routerAddress: Address;
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
    protected swappablePairs = new Map<
        `${Address}-${Address}`,
        SwappablePairResult | { pendingResult: Promise<boolean> }
    >();

    constructor(routerAddress: Address, chainId: ChainId, config: KyberHelperConfig) {
        const { cacheTimeout_ms: swappablePairsExpirationTimeout_ms, state } = {
            ...KyberHelper.DEFAULT_CONFIG_PARAM,
            ...config,
        };

        this.routerAddress = routerAddress;
        this.networkConnection = copyNetworkConnection(config);
        this.chainId = chainId;
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

    async makeCall(input: RawTokenAmount<BigNumberish>, output: Address): Promise<KybercallData> {
        if (!isKyberSupportedChain(this.chainId)) {
            throw new Error(`Chain ${this.chainId} is not supported for kybercall.`);
        }
        if (isSameAddress(input.token, output))
            return { outputAmount: input.amount, encodedSwapData: [], routerAddress: NATIVE_ADDRESS_0x00 };
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

        type RawKybercallData = {
            amountInUsd?: number;
            amountOutUsd?: number;
            outputAmount: BigNumberish;
            encodedSwapData?: BytesLike;
            routerAddress: string;
        };

        const { data }: { data: RawKybercallData } = await axios
            .get(KYBER_API[this.chainId], {
                params,
                headers: { 'Accept-Version': 'Latest' },
            })
            .catch(() => {
                return {
                    data: {
                        outputAmount: 0,
                        encodedSwapData: undefined,
                        routerAddress: NATIVE_ADDRESS_0x00,
                    },
                };
            });
        return {
            ...data,
            routerAddress: toAddress(data.routerAddress),
        };
    }

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
            const decimals = await new ERC20(srcTokenAddress, this.chainId, this.networkConnection).decimals(params);
            const testAmount = BN.from(10).pow(decimals).mul(100);
            const kybercallData = await this.makeCall({ token: srcTokenAddress, amount: testAmount }, dstTokenAddress);
            const kybercall = kybercallData.encodedSwapData;
            const swappable = kybercall != undefined;
            this.swappablePairs.set(key, { swappable, checkedAtTimestamp: Date.now() });
            return swappable;
        })();

        this.swappablePairs.set(key, { pendingResult: res });
        return res;
    }
}
