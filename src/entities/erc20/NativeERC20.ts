import { ERC20Like } from './ERC20Like';
import {
    Address,
    BN,
    BigNumberish,
    NetworkConnection,
    copyNetworkConnection,
    ethersConstants,
    TransactionResponse,
    NATIVE_ADDRESS_0x00,
    areSameAddresses,
    NativeTokenAddress,
} from '../../common';
import { PendleSdkError } from '../../errors';

export type NativeERC20Config = NetworkConnection;

/**
 * A wrapper class to interact with native tokens the same way as
 * a normal ERC20 token.
 */
export class NativeERC20 implements ERC20Like {
    readonly networkConnection: NetworkConnection;
    private readonly _name: string;
    private readonly _symbol: string;

    constructor(readonly address: NativeTokenAddress, config: NativeERC20Config) {
        this.networkConnection = copyNetworkConnection(config);

        if (areSameAddresses(address, NATIVE_ADDRESS_0x00)) {
            this._name = '[NATIVE TOKEN 0x00]';
            this._symbol = '0x00';
        } else {
            this._name = '[NATIVE TOKEN 0xEE]';
            this._symbol = '0xEE';
        }
    }

    /**
     * As a native token is not a real ERC20, a placeholder name is returned instead.
     * @returns
     * - `'[NATIVE TOKEN 0x00]'` is returned when `this.address` is {@link NATIVE_ADDRESS_0x00}.
     * - `'[NATIVE TOKEN 0xEE]'` is returned otherwise.
     */
    async name(): Promise<string> {
        return Promise.resolve(this._name);
    }

    /**
     * As a native token is not a real ERC20, a placeholder symbol is returned instead.
     * @returns
     * - `'0x00'` is returned when `this.address` is {@link NATIVE_ADDRESS_0x00}.
     * - `'0xEE'` is returned otherwise.
     */
    async symbol(): Promise<string> {
        return Promise.resolve(this._symbol);
    }

    get provider() {
        if (this.networkConnection.provider != undefined) {
            return this.networkConnection.provider;
        }
        if (this.networkConnection.signer.provider != undefined) {
            return this.networkConnection.signer.provider;
        }
        throw new PendleSdkError('A provider or a connected signer is required for this operation');
    }

    get signer() {
        if (this.networkConnection.signer != undefined) {
            return this.networkConnection.signer;
        }
        throw new PendleSdkError('A signer is required for this operation');
    }

    async decimals(): Promise<number> {
        return Promise.resolve(18);
    }

    async balanceOf(userAddress: Address): Promise<BN> {
        return this.provider.getBalance(userAddress);
    }

    /**
     * As a native token is not a real ERC20, `2^256 - 1` is returned instead.
     */
    async allowance(_owner: Address, _spender: Address): Promise<BN> {
        return Promise.resolve(ethersConstants.MaxUint256);
    }

    /**
     * No actual action is done.
     * @returns undefined
     */
    async approve(_spender: Address, _amount: BN) {
        return Promise.resolve(undefined);
    }

    async transfer(to: Address, amount: BigNumberish): Promise<TransactionResponse> {
        const signer = this.signer;
        return signer.sendTransaction({
            to,
            value: amount,
        });
    }
}
