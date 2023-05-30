import {
    CHAIN_ID_MAPPING,
    NATIVE_ADDRESS_0x00,
    NATIVE_ADDRESS_0xEE,
    Router,
    VoidAggregatorHelper,
    createTokenAmount,
} from '../src';
import { currentConfig } from './util/testEnv';
import { BigNumber as BN } from 'ethers';
import { networkConnection } from './util/testEnv';

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
    it('router with undefined aggregator helper', () => {
        expect(router.aggregatorHelper).toBeInstanceOf(VoidAggregatorHelper);
    });
});
