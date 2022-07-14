/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, utils, Contract, ContractFactory, Overrides } from 'ethers';
import { Provider, TransactionRequest } from '@ethersproject/providers';
import type { TestContract, TestContractInterface } from '../TestContract';

const _abi = [
    {
        inputs: [
            {
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
        ],
        name: 'decreaseTotal',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getTotal',
        outputs: [
            {
                internalType: 'uint256',
                name: '',
                type: 'uint256',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
        ],
        name: 'increaseTotal',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
        ],
        name: 'setTotal',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];

const _bytecode =
    '0x608060405234801561001057600080fd5b50610178806100206000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80631f8d1d5014610051578063775a25e31461006657806381fa54311461007b578063c97231df1461008e575b600080fd5b61006461005f3660046100cb565b600055565b005b60005460405190815260200160405180910390f35b6100646100893660046100cb565b6100a1565b61006461009c3660046100cb565b6100ba565b806000808282546100b29190610113565b909155505050565b806000808282546100b2919061012b565b6000602082840312156100dd57600080fd5b5035919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60008219821115610126576101266100e4565b500190565b60008282101561013d5761013d6100e4565b50039056fea26469706673582212203144a1d7798d993e29bc8ea106b49bfd2fb91c49efea94396f39b324f055ba6a64736f6c634300080b0033';

export class TestContract__factory extends ContractFactory {
    constructor(...args: [signer: Signer] | ConstructorParameters<typeof ContractFactory>) {
        if (args.length === 1) {
            super(_abi, _bytecode, args[0]);
        } else {
            super(...args);
        }
    }

    deploy(overrides?: Overrides & { from?: string | Promise<string> }): Promise<TestContract> {
        return super.deploy(overrides || {}) as Promise<TestContract>;
    }
    getDeployTransaction(overrides?: Overrides & { from?: string | Promise<string> }): TransactionRequest {
        return super.getDeployTransaction(overrides || {});
    }
    attach(address: string): TestContract {
        return super.attach(address) as TestContract;
    }
    connect(signer: Signer): TestContract__factory {
        return super.connect(signer) as TestContract__factory;
    }
    static readonly bytecode = _bytecode;
    static readonly abi = _abi;
    static createInterface(): TestContractInterface {
        return new utils.Interface(_abi) as TestContractInterface;
    }
    static connect(address: string, signerOrProvider: Signer | Provider): TestContract {
        return new Contract(address, _abi, signerOrProvider) as TestContract;
    }
}
