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
    isSameAddress,
    NativeTokenAddress,
} from '../../common';
import { PendleSdkError } from '../../errors';

export type NativeERC20Config = NetworkConnection;

export class NativeERC20 implements ERC20Like {
    readonly networkConnection: NetworkConnection;
    private readonly _name: string;
    private readonly _symbol: string;

    constructor(readonly address: NativeTokenAddress, config: NativeERC20Config) {
        this.networkConnection = copyNetworkConnection(config);

        if (isSameAddress(address, NATIVE_ADDRESS_0x00)) {
            this._name = '[NATIVE TOKEN 0x00]';
            this._symbol = '0x00';
        } else {
            this._name = '[NATIVE TOKEN 0xEE]';
            this._symbol = '0xEE';
        }
    }

    async name(): Promise<string> {
        return this._name;
    }

    async symbol(): Promise<string> {
        return this._symbol;
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
        return 18;
    }

    async balanceOf(userAddress: Address): Promise<BN> {
        return this.provider.getBalance(userAddress);
    }

    async allowance(_owner: Address, _spender: Address): Promise<BN> {
        return ethersConstants.MaxUint256;
    }

    async approve(_spender: Address, _amount: BN) {
        return undefined;
    }

    async transfer(to: Address, amount: BigNumberish): Promise<TransactionResponse> {
        const signer = this.signer;
        const provider = this.provider;
        return signer.sendTransaction({
            to,
            value: amount,
        });
    }
}
