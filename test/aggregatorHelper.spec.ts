import {
    CHAIN_ID_MAPPING,
    NATIVE_ADDRESS_0x00,
    NATIVE_ADDRESS_0xEE,
    Router,
    VoidAggregatorHelper,
    createTokenAmount,
    OneInchAggregatorHelper,
} from '../src';
import { currentConfig, networkConnection, describeIf, env } from './util/testEnv';
import { BigNumber as BN } from 'ethers';
import { SLIPPAGE_TYPE2 } from './util/constants';
import { print } from './util/testHelper';

describe('VoidAggregatorHelper', () => {
    const usdcAmount = createTokenAmount({ token: currentConfig.tokens.USDC, amount: BN.from(10) });
    const usdcAddress = currentConfig.tokens.USDC;
    const nativeTokenAmount = createTokenAmount({ token: NATIVE_ADDRESS_0x00, amount: BN.from(10) });
    const voidAggregatorHelper = new VoidAggregatorHelper();
    const router = Router.getRouter({ chainId: CHAIN_ID_MAPPING.ETHEREUM, provider: networkConnection.provider });
    it('swap same token', () => {
        expect(voidAggregatorHelper.makeCall(usdcAmount, usdcAddress)).toBeDefined();
        expect(voidAggregatorHelper.makeCall(nativeTokenAmount, NATIVE_ADDRESS_0x00)).toBeDefined();
        expect(voidAggregatorHelper.makeCall(nativeTokenAmount, NATIVE_ADDRESS_0xEE)).toBeDefined();
    });
    it('swap different tokens', () => {
        expect(voidAggregatorHelper.makeCall(usdcAmount, NATIVE_ADDRESS_0x00)).toBeUndefined();
        expect(voidAggregatorHelper.makeCall(nativeTokenAmount, usdcAddress)).toBeUndefined();
    });
    it('router with undefined aggregator helper', async () => {
        await expect(
            router.aggregatorHelper.makeCall(nativeTokenAmount, usdcAddress, SLIPPAGE_TYPE2)
        ).rejects.toThrowError();
    });
});

describeIf(env.AGGREGATOR_HELPER === 'ONEINCH', 'OneInchAggregatorHelper', () => {
    const oneInchAggregatorHelper = currentConfig.aggregatorHelper as OneInchAggregatorHelper;
    const usdcAmount = createTokenAmount({ token: currentConfig.tokens.USDC, amount: BN.from(10) });
    const daiAddress = currentConfig.tokens.DAI;
    it('protocols for scale', async () => {
        const protocols = await oneInchAggregatorHelper.getLiquiditySources({ needScale: true });
        print(protocols);
        for (const protocol of protocols) {
            expect(protocol).not.toMatch(/LIMIT_ORDER/);
            expect(protocol).not.toMatch(/PMM/);
        }
    });

    it('swap', async () => {
        const swapResult = await oneInchAggregatorHelper.makeCall(usdcAmount, daiAddress, SLIPPAGE_TYPE2);
        expect(swapResult).toBeDefined();
    });

    it('default liquidity sources cache', async () => {
        const firstCall = await OneInchAggregatorHelper.provideCachedLiquiditySources(oneInchAggregatorHelper);
        const secondCall = await OneInchAggregatorHelper.provideCachedLiquiditySources(oneInchAggregatorHelper);
        expect(Object.is(firstCall, secondCall)).toBe(true);
    });
});
