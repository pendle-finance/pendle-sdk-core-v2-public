import { BigNumber as BN, BigNumberish, ethers } from 'ethers';
import { Address, bnMin, Multicall, ChainId, areSameAddresses, isNativeToken, toAddress } from '../../src';
import * as pendleSDK from '../../src';
import { networkConnection, USE_HARDHAT_RPC, currentConfig, AMOUNT_TO_TEST_IN_USD } from './testEnv';
import * as testEnv from './testEnv';
import { inspect } from 'util';
import BigNumber from 'bignumber.js';
import * as pendleBackend from './pendleBackend';
import * as erc20SlotScanner from './erc20SlotScanner';
import * as tokenHelper from './tokenHelper';

export function describeIf(condition: boolean) {
    return condition ? describe : describe.skip;
}

export function bnMinAsBn(a: BigNumberish, b: BigNumberish): BN {
    return BN.from(bnMin(a, b));
}

export async function evm_snapshot(): Promise<string> {
    if (!USE_HARDHAT_RPC) throw new Error('evm_snapshot is only available when using hardhat rpc');
    return networkConnection.provider.send('evm_snapshot', []) as Promise<string>;
}

export async function evm_revert(snapshotId: string): Promise<void> {
    if (!USE_HARDHAT_RPC) throw new Error('evm_revert is only available when using hardhat rpc');
    await networkConnection.provider.send('evm_revert', [snapshotId]);
}

export function useRestoreEvmSnapShotAfterEach(): {
    getCurrentSnapshotId(): string;
} {
    let snapshotId = '';

    beforeEach(async () => {
        snapshotId = await evm_snapshot();
    });

    afterEach(async () => {
        await evm_revert(snapshotId);
    });

    return {
        getCurrentSnapshotId() {
            return snapshotId;
        },
    };
}

export function useRestoreEvmSnapShotAfterAll(): {
    getCurrentSnapshotId(): string;
} {
    let snapshotId = '';

    beforeAll(async () => {
        snapshotId = await evm_snapshot();
    });

    afterAll(async () => {
        await evm_revert(snapshotId);
    });

    return {
        getCurrentSnapshotId() {
            return snapshotId;
        },
    };
}

export function print(message: unknown): void {
    // eslint-disable-next-line no-console
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}

export function prettifyJson(
    json: unknown,
    params?: {
        depth?: number;
    }
): string {
    return inspect(json, { showHidden: false, depth: params?.depth ?? null, colors: true });
}

export function describeWithMulticall(fn: (multicall: Multicall | undefined) => any) {
    if (process.env.DISABLE_TEST_WITH_MULTICALL !== '1') {
        describe('with multicall', () => fn(currentConfig.multicall));
    }
    if (process.env.DISABLE_TEST_WITHOUT_MULTICALL !== '1') {
        describe('without multicall', () => fn(undefined));
    }
}

export function itWhen(condition: boolean) {
    if (!condition) return it.skip;
    return it;
}

export async function setERC20Balance(address: Address, user: Address, value: BN) {
    if (isNativeToken(address)) {
        await networkConnection.provider.send('hardhat_setBalance', [
            user,
            ethers.utils.hexStripZeros(value.toHexString()),
        ]);
        return;
    }
    const slot = await erc20SlotScanner.getSlot(
        testEnv.currentConfig.chainId,
        address,
        testEnv.networkConnection.provider
    );
    if (!slot) {
        // eslint-disable-next-line no-console
        console.error(`Can not set user balance for token ${address}`);
        return;
    }
    await erc20SlotScanner.setERC20Balance(address, user, value, slot, networkConnection.provider);
}

export async function incERC20Balance(tokenAddress: Address, user: Address, additionalValue: BN) {
    const curBalance = await tokenHelper.getBalance(tokenAddress, user);
    await setERC20Balance(tokenAddress, user, curBalance.add(additionalValue));
}

export async function setPendleERC20Balance(market: Address, user: Address, value: BN) {
    await erc20SlotScanner.setERC20Balance(market, user, value, [0, false], networkConnection.provider);
}

export async function increaseNativeBalance(userAddress: string) {
    await networkConnection.provider.send('hardhat_setBalance', [
        userAddress,
        // 1e6 ETH
        ethers.utils.hexStripZeros(
            BN.from(10)
                .pow(18 + 6)
                .toHexString()
        ),
    ]);
}

const PENDLE_ALL_ASSETS_CACHE: Map<ChainId, pendleBackend.PendleAllAssetsResponse> = new Map();

export async function prefetchAllAssetFromPendleBackend(
    chainId: ChainId
): Promise<pendleBackend.PendleAllAssetsResponse> {
    const res = await pendleBackend.fetchAllAsset(chainId);
    PENDLE_ALL_ASSETS_CACHE.set(chainId, res);
    return res;
}

export function fetchPriceInfo(
    address: Address,
    chainId: ChainId
): {
    price: number;
    decimals: number;
} {
    const token = PENDLE_ALL_ASSETS_CACHE.get(chainId)?.find((asset) => {
        if (isNativeToken(toAddress(asset.address)) && isNativeToken(address)) return true;
        return areSameAddresses(address, toAddress(asset.address));
    });
    if (!token) {
        throw new Error(`Cannot find token ${address} in the list of all assets`);
    }
    return {
        price: token.price.usd,
        decimals: token.decimals,
    };
}

export function valueToTokenAmount(token: Address, chainId: ChainId, value: number = AMOUNT_TO_TEST_IN_USD) {
    const { price, decimals } = fetchPriceInfo(token, chainId);
    const tokenAmount = value / price;
    const rawTokenAmount = BN.from(
        BigNumber(tokenAmount)
            .times(10 ** decimals)
            .toFixed(0)
    );
    return rawTokenAmount;
}

export function useSetTime(
    targetTime: Date,
    provider: ethers.providers.JsonRpcProvider = testEnv.networkConnection.provider
) {
    useRestoreEvmSnapShotAfterAll();

    beforeAll(async () => {
        jest.useFakeTimers({ advanceTimers: true }).setSystemTime(targetTime);

        const blk = await provider.getBlock('latest');
        const timeToIncrease = Math.ceil(targetTime.getTime() / 1000) - blk.timestamp;
        const param = ethers.utils.hexStripZeros(BN.from(timeToIncrease).toHexString());
        await provider.send('evm_increaseTime', [param]);
        await provider.send('evm_mine', []);
    });

    afterAll(() => {
        jest.useRealTimers();
    });
}

export function convertValueViaSpotPrice(
    chainId: pendleSDK.ChainId,
    input: pendleSDK.RawTokenAmount,
    output: pendleSDK.Address
) {
    const inpInfo = fetchPriceInfo(input.token, chainId);
    const outInfo = fetchPriceInfo(output, chainId);
    const inpToOutRate = inpInfo.price / outInfo.price;

    const D = 10 ** 6;
    const num = 10n ** BigInt(outInfo.decimals) * BigInt(Math.floor(inpToOutRate * D));
    const dem = 10n ** BigInt(inpInfo.decimals) * BigInt(D);
    return pendleSDK.BN.from((input.amount.toBigInt() * num) / dem);
}

const inspectCustomSymbol = Symbol.for('nodejs.util.inspect.custom');

const registerCustomInspection = (BigNumber: any) => {
    BigNumber.prototype[inspectCustomSymbol] = function (this: pendleSDK.BN) {
        const value = this.toString();
        return `BigNumber { value: "${value}" }`;
    };
};

const registerCustomInspectionForMetaMethod = (metaMethod: any) => {
    metaMethod.prototype[inspectCustomSymbol] = function (
        this: pendleSDK.ContractMetaMethod<any, never, any>,
        _depth: number,
        _options: object,
        inspectFn: typeof inspect
    ) {
        return inspectFn(
            {
                name: 'ContractMetaMethod',
                contractAddress: this.contract.address,
                method: this.methodName,
                data: this.data,
                // TODO args
            },
            {
                depth: 2,
                colors: true,
            }
        );
    };
};

registerCustomInspection(BN);
registerCustomInspectionForMetaMethod(pendleSDK.ContractMetaMethod);
