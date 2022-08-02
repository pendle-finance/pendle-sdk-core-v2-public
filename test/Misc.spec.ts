import { BigNumber as BN, Contract } from 'ethers';
import { CHAIN_ID, ERC20 } from '../src';
import {
    calcSlippedDownAmount,
    calcSlippedUpAmount,
    decimalFactor,
    getContractAddresses,
    InvalidSlippageError,
    isMainchain,
} from '../src/entities/helper';

describe('Misc', () => {
    it('#InvalidSlippageError', () => {
        InvalidSlippageError.verify(0);
        InvalidSlippageError.verify(1);
        InvalidSlippageError.verify(0.5);
        expect(() => InvalidSlippageError.verify(-1)).toThrowError(InvalidSlippageError);
        expect(() => InvalidSlippageError.verify(1.1)).toThrowError(InvalidSlippageError);
    });

    it('#calcSlippedDownAmount', () => {
        const amount = BN.from(100);
        expect(calcSlippedDownAmount(amount, 0).eq(amount));
        expect(calcSlippedDownAmount(amount, 0.3).eq(amount.mul(70).div(100)));
        expect(calcSlippedDownAmount(amount, 0.5).eq(amount.mul(50).div(100)));
        expect(calcSlippedDownAmount(amount, 1).eq(0));
        expect(() => calcSlippedDownAmount(amount, -1)).toThrowError(InvalidSlippageError);
        expect(() => calcSlippedDownAmount(amount, 1.1)).toThrowError(InvalidSlippageError);
    });

    it('#calcSlippedUpAmount', () => {
        const amount = BN.from(100);
        expect(calcSlippedUpAmount(amount, 0).eq(amount));
        expect(calcSlippedUpAmount(amount, 0.3).eq(amount.mul(130).div(100)));
        expect(calcSlippedUpAmount(amount, 0.5).eq(amount.mul(150).div(100)));
        expect(calcSlippedUpAmount(amount, 1).eq(amount.mul(2)));
        expect(() => calcSlippedUpAmount(amount, -1)).toThrowError(InvalidSlippageError);
        expect(() => calcSlippedUpAmount(amount, 1.1)).toThrowError(InvalidSlippageError);
    });

    it('#getContractAddresses', () => {
        Object.values(CHAIN_ID).forEach((chainId) => {
            let addresses = getContractAddresses(chainId);
            expect(addresses.ROUTER_STATIC).toBeDefined();
            expect(addresses.ROUTER).toBeDefined();
            expect(addresses.PENDLE).toBeDefined();
            expect(addresses.VEPENDLE).toBeDefined();
        });
    });

    it('#isMainchain', () => {
        expect(isMainchain(CHAIN_ID.ETHEREUM)).toBe(true);
        expect(isMainchain(CHAIN_ID.FUJI)).toBe(true);
        expect(isMainchain(CHAIN_ID.AVALANCHE)).toBe(false);
        expect(isMainchain(CHAIN_ID.MUMBAI)).toBe(false);
    });
});
