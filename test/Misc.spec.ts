import { BigNumber as BN } from 'ethers';
import { CHAIN_ID, ERC20 } from '../src';
import { getContractAddresses, isMainchain } from '../src/entities/helper';
import { calcSlippedDownAmount, calcSlippedUpAmount } from '../src/entities/math';
import { InvalidSlippageError } from '../src/errors';
import './util/bigNumberMatcher';
import { currentConfig, ACTIVE_CHAIN_ID, networkConnection } from './util/testUtils';

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

    it('test requiresSigner', async () => {
        const usdWithoutSigner = new ERC20(currentConfig.tokens.USDC, ACTIVE_CHAIN_ID, {
            provider: networkConnection.provider,
        });

        expect(async () => usdWithoutSigner.transfer(currentConfig.marketAddress, 1)).rejects.toThrowError();
    });
});
