/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, utils, BigNumberish, Contract, ContractFactory, Overrides } from 'ethers';
import { Provider, TransactionRequest } from '@ethersproject/providers';
import type { ERC20, ERC20Interface } from '../ERC20';

const _abi = [
    {
        inputs: [
            {
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
            {
                internalType: 'string',
                name: '_name',
                type: 'string',
            },
            {
                internalType: 'string',
                name: '_symbol',
                type: 'string',
            },
            {
                internalType: 'uint8',
                name: '_decimal',
                type: 'uint8',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'constructor',
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: 'owner',
                type: 'address',
            },
            {
                indexed: true,
                internalType: 'address',
                name: 'spender',
                type: 'address',
            },
            {
                indexed: false,
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
        ],
        name: 'Approval',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: 'from',
                type: 'address',
            },
            {
                indexed: true,
                internalType: 'address',
                name: 'to',
                type: 'address',
            },
            {
                indexed: false,
                internalType: 'uint256',
                name: 'value',
                type: 'uint256',
            },
        ],
        name: 'Transfer',
        type: 'event',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'owner',
                type: 'address',
            },
            {
                internalType: 'address',
                name: 'spender',
                type: 'address',
            },
        ],
        name: 'allowance',
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
                internalType: 'address',
                name: 'spender',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256',
            },
        ],
        name: 'approve',
        outputs: [
            {
                internalType: 'bool',
                name: '',
                type: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'account',
                type: 'address',
            },
        ],
        name: 'balanceOf',
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
        inputs: [],
        name: 'decimals',
        outputs: [
            {
                internalType: 'uint8',
                name: '',
                type: 'uint8',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'name',
        outputs: [
            {
                internalType: 'string',
                name: '',
                type: 'string',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'symbol',
        outputs: [
            {
                internalType: 'string',
                name: '',
                type: 'string',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalSupply',
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
                internalType: 'address',
                name: 'to',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256',
            },
        ],
        name: 'transfer',
        outputs: [
            {
                internalType: 'bool',
                name: '',
                type: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'from',
                type: 'address',
            },
            {
                internalType: 'address',
                name: 'to',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256',
            },
        ],
        name: 'transferFrom',
        outputs: [
            {
                internalType: 'bool',
                name: '',
                type: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];

const _bytecode =
    '0x60806040523480156200001157600080fd5b5060405162000bce38038062000bce833981016040819052620000349162000207565b600084815533815260016020908152604090912085905583516200005f916003919086019062000094565b5081516200007590600490602085019062000094565b506005805460ff191660ff9290921691909117905550620002d2915050565b828054620000a29062000295565b90600052602060002090601f016020900481019282620000c6576000855562000111565b82601f10620000e157805160ff191683800117855562000111565b8280016001018555821562000111579182015b8281111562000111578251825591602001919060010190620000f4565b506200011f92915062000123565b5090565b5b808211156200011f576000815560010162000124565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126200016257600080fd5b81516001600160401b03808211156200017f576200017f6200013a565b604051601f8301601f19908116603f01168101908282118183101715620001aa57620001aa6200013a565b81604052838152602092508683858801011115620001c757600080fd5b600091505b83821015620001eb5785820183015181830184015290820190620001cc565b83821115620001fd5760008385830101525b9695505050505050565b600080600080608085870312156200021e57600080fd5b845160208601519094506001600160401b03808211156200023e57600080fd5b6200024c8883890162000150565b945060408701519150808211156200026357600080fd5b50620002728782880162000150565b925050606085015160ff811681146200028a57600080fd5b939692955090935050565b600181811c90821680620002aa57607f821691505b60208210811415620002cc57634e487b7160e01b600052602260045260246000fd5b50919050565b6108ec80620002e26000396000f3fe608060405234801561001057600080fd5b50600436106100a35760003560e01c8063313ce5671161007657806395d89b411161005b57806395d89b411461014c578063a9059cbb14610154578063dd62ed3e1461016757600080fd5b8063313ce5671461010e57806370a082311461012357600080fd5b806306fdde03146100a8578063095ea7b3146100c657806318160ddd146100e957806323b872dd146100fb575b600080fd5b6100b06101a0565b6040516100bd91906106ba565b60405180910390f35b6100d96100d4366004610749565b610232565b60405190151581526020016100bd565b6000545b6040519081526020016100bd565b6100d9610109366004610773565b6102f4565b60055460405160ff90911681526020016100bd565b6100ed6101313660046107af565b6001600160a01b031660009081526001602052604090205490565b6100b0610568565b6100d9610162366004610749565b610577565b6100ed6101753660046107d1565b6001600160a01b03918216600090815260026020908152604080832093909416825291909152205490565b6060600380546101af90610804565b80601f01602080910402602001604051908101604052809291908181526020018280546101db90610804565b80156102285780601f106101fd57610100808354040283529160200191610228565b820191906000526020600020905b81548152906001019060200180831161020b57829003601f168201915b5050505050905090565b60006001600160a01b03831661028f5760405162461bcd60e51b815260206004820152601760248201527f416464726573732073686f756c64206e6f74206265203000000000000000000060448201526064015b60405180910390fd5b3360008181526002602090815260408083206001600160a01b03881680855290835292819020869055518581529192917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92591015b60405180910390a350600192915050565b60006001600160a01b03841661034c5760405162461bcd60e51b815260206004820152601760248201527f416464726573732073686f756c64206e6f7420626520300000000000000000006044820152606401610286565b6001600160a01b0383166103a25760405162461bcd60e51b815260206004820152601760248201527f416464726573732073686f756c64206e6f7420626520300000000000000000006044820152606401610286565b6001600160a01b03841660009081526001602052604090205482111561040a5760405162461bcd60e51b815260206004820152601360248201527f496e73756666696369656e7420616d6f756e74000000000000000000000000006044820152606401610286565b6001600160a01b038416600090815260026020908152604080832033845290915290205482111561047d5760405162461bcd60e51b815260206004820152601660248201527f496e73756666696369656e7420616c6c6f77616e6365000000000000000000006044820152606401610286565b6001600160a01b0384166000908152600260209081526040808320338452909152812080548492906104b0908490610887565b90915550506001600160a01b038416600090815260016020526040812080548492906104dd908490610887565b90915550506001600160a01b0383166000908152600160205260408120805484929061050a90849061089e565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161055691815260200190565b60405180910390a35060019392505050565b6060600480546101af90610804565b336000908152600160205260408120548211156105d65760405162461bcd60e51b815260206004820152601360248201527f496e73756666696369656e7420616d6f756e74000000000000000000000000006044820152606401610286565b6001600160a01b03831661062c5760405162461bcd60e51b815260206004820152601760248201527f416464726573732073686f756c64206e6f7420626520300000000000000000006044820152606401610286565b336000908152600160205260408120805484929061064b908490610887565b90915550506001600160a01b0383166000908152600160205260408120805484929061067890849061089e565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906020016102e3565b600060208083528351808285015260005b818110156106e7578581018301518582016040015282016106cb565b818111156106f9576000604083870101525b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016929092016040019392505050565b80356001600160a01b038116811461074457600080fd5b919050565b6000806040838503121561075c57600080fd5b6107658361072d565b946020939093013593505050565b60008060006060848603121561078857600080fd5b6107918461072d565b925061079f6020850161072d565b9150604084013590509250925092565b6000602082840312156107c157600080fd5b6107ca8261072d565b9392505050565b600080604083850312156107e457600080fd5b6107ed8361072d565b91506107fb6020840161072d565b90509250929050565b600181811c9082168061081857607f821691505b60208210811415610852577f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60008282101561089957610899610858565b500390565b600082198211156108b1576108b1610858565b50019056fea2646970667358221220071f3a0afe7fa904a58b407aa139d85fe5f651ee79f7792f34d0fffdb221128d64736f6c634300080b0033';

export class ERC20__factory extends ContractFactory {
    constructor(...args: [signer: Signer] | ConstructorParameters<typeof ContractFactory>) {
        if (args.length === 1) {
            super(_abi, _bytecode, args[0]);
        } else {
            super(...args);
        }
    }

    deploy(
        value: BigNumberish,
        _name: string,
        _symbol: string,
        _decimal: BigNumberish,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ERC20> {
        return super.deploy(value, _name, _symbol, _decimal, overrides || {}) as Promise<ERC20>;
    }
    getDeployTransaction(
        value: BigNumberish,
        _name: string,
        _symbol: string,
        _decimal: BigNumberish,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): TransactionRequest {
        return super.getDeployTransaction(value, _name, _symbol, _decimal, overrides || {});
    }
    attach(address: string): ERC20 {
        return super.attach(address) as ERC20;
    }
    connect(signer: Signer): ERC20__factory {
        return super.connect(signer) as ERC20__factory;
    }
    static readonly bytecode = _bytecode;
    static readonly abi = _abi;
    static createInterface(): ERC20Interface {
        return new utils.Interface(_abi) as ERC20Interface;
    }
    static connect(address: string, signerOrProvider: Signer | Provider): ERC20 {
        return new Contract(address, _abi, signerOrProvider) as ERC20;
    }
}
