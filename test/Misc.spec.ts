import { BigNumber as BN } from 'ethers';
import {
    CHAIN_ID_MAPPING,
    ERC20Entity,
    getContractAddresses,
    isMainchain,
    calcSlippedDownAmount,
    calcSlippedUpAmount,
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

    it('#getContractAddresses', () => {
        Object.values(CHAIN_ID_MAPPING).forEach((chainId) => {
            let addresses = getContractAddresses(chainId);
            expect(addresses.ROUTER_STATIC).toBeDefined();
            expect(addresses.ROUTER).toBeDefined();
            expect(addresses.PENDLE).toBeDefined();
            expect(addresses.VEPENDLE).toBeDefined();
        });
    });

    it('#isMainchain', () => {
        expect(isMainchain(CHAIN_ID_MAPPING.ETHEREUM)).toBe(true);
        expect(isMainchain(CHAIN_ID_MAPPING.FUJI)).toBe(true);
        expect(isMainchain(CHAIN_ID_MAPPING.AVALANCHE)).toBe(false);
        expect(isMainchain(CHAIN_ID_MAPPING.MUMBAI)).toBe(false);
    });

    it('test write without signer', async () => {
        const usdWithoutSigner = new ERC20Entity(currentConfig.tokens.USDC, {
            provider: networkConnection.provider,
        });

        expect(async () => usdWithoutSigner.transfer(currentConfig.marketAddress, 1)).rejects.toThrowError();
    });
});
