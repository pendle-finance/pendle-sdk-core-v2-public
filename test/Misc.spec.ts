import { BigNumber as BN } from 'ethers';
import {
    CHAIN_ID_MAPPING,
    ERC20Entity,
    getContractAddresses,
    isMainchain,
    calcSlippedDownAmount,
    calcSlippedUpAmount,
    calcSlippedDownAmountSqrt,
} from '../src';
import { InvalidSlippageError } from '../src/errors';
import { currentConfig, networkConnection } from './util/testEnv';

describe('Misc', () => {
    it('#InvalidSlippageError', () => {
        InvalidSlippageError.verify(0);
        InvalidSlippageError.verify(1);
        InvalidSlippageError.verify(0.5);
    });

    it('#calcSlippedDownAmount', () => {
        const amount = BN.from(100);
        expect(calcSlippedDownAmount(amount, 0)).toEqBN(amount);
        expect(calcSlippedDownAmount(amount, 0.3)).toEqBN(amount.mul(70).div(100));
        expect(calcSlippedDownAmount(amount, 0.5)).toEqBN(amount.mul(50).div(100));
        expect(calcSlippedDownAmount(amount, 1)).toEqBN(0);
    });

    it('#calcSlippedUpAmount', () => {
        const amount = BN.from(100);
        expect(calcSlippedUpAmount(amount, 0)).toEqBN(amount);
        expect(calcSlippedUpAmount(amount, 0.3)).toEqBN(amount.mul(130).div(100));
        expect(calcSlippedUpAmount(amount, 0.5)).toEqBN(amount.mul(150).div(100));
        expect(calcSlippedUpAmount(amount, 1)).toEqBN(amount.mul(2));
    });

    it('#calcSlippedUpAmount', () => {
        const amount = BN.from(100);
        expect(calcSlippedDownAmountSqrt(amount, 0)).toEqBN(amount);
        expect(calcSlippedDownAmountSqrt(amount, 0.19)).toEqBN(amount.mul(9).div(10));
        expect(calcSlippedDownAmountSqrt(amount, 0.64)).toEqBN(amount.mul(6).div(10));
        expect(calcSlippedDownAmountSqrt(amount, 0.36)).toEqBN(amount.mul(8).div(10));
        expect(calcSlippedDownAmountSqrt(amount, 1)).toEqBN(0);
    });

    it('#getContractAddresses', () => {
        Object.values(CHAIN_ID_MAPPING).forEach((chainId) => {
            const addresses = getContractAddresses(chainId);
            expect(addresses.ROUTER_STATIC).toBeDefined();
            expect(addresses.ROUTER).toBeDefined();
            expect(addresses.PENDLE).toBeDefined();
            expect(addresses.VEPENDLE).toBeDefined();
        });
    });

    it('#isMainchain', () => {
        expect(isMainchain(CHAIN_ID_MAPPING.ETHEREUM)).toBe(true);
        expect(isMainchain(CHAIN_ID_MAPPING.FUJI)).toBe(true);
        expect(isMainchain(CHAIN_ID_MAPPING.MUMBAI)).toBe(false);
    });

    it('test write without signer', async () => {
        const usdWithoutSigner = new ERC20Entity(currentConfig.tokens.USDC, {
            provider: networkConnection.provider,
        });

        await expect(async () => usdWithoutSigner.transfer(currentConfig.marketAddress, 1)).rejects.toThrowError();
    });
});
