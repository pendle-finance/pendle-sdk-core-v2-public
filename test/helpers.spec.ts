import { Wallet } from 'ethers';
import { getProviderFromNetworkConnection } from '../src';
import { networkConnectionWithChainId } from './util/testEnv';

describe('Get Provider', () => {
    const { provider, signer } = networkConnectionWithChainId;
    const networkConnectionOnlyProvider = { provider };
    const networkConnectionOnlySigner = { signer };
    const signerWithoutProvider = { signer: Wallet.fromMnemonic('test '.repeat(11) + 'junk') };

    it('Should return provider with checked', () => {
        const provider = getProviderFromNetworkConnection(networkConnectionOnlyProvider, true);
        expect(provider).toBeDefined();
    });
    it('Should return provider by signer', () => {
        const provider = getProviderFromNetworkConnection(networkConnectionOnlySigner);
        expect(provider).toBeDefined();
        expect(provider?._isProvider).toBeTruthy();
    });
    it('Should be undefined', () => {
        const provider = getProviderFromNetworkConnection(signerWithoutProvider);
        expect(provider).toBeUndefined();
    });
    it('Should throw error no provider', () => {
        expect(() => getProviderFromNetworkConnection(signerWithoutProvider, true)).toThrow(
            'Provider does not exist in networkConnection'
        );
    });
});
