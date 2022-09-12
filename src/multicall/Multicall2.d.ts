/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import {
    ethers,
    EventFilter,
    Signer,
    BigNumber,
    BigNumberish,
    PopulatedTransaction,
    BaseContract,
    ContractTransaction,
    Overrides,
    CallOverrides,
} from 'ethers';
import { BytesLike } from '@ethersproject/bytes';
import { Listener, Provider } from '@ethersproject/providers';
import { FunctionFragment, EventFragment, Result } from '@ethersproject/abi';
import type { TypedEventFilter, TypedEvent, TypedListener } from '@pendle/core-v2/typechain-types/common';

interface Multicall2Interface extends ethers.utils.Interface {
    functions: {
        'aggregate(tuple[])': FunctionFragment;
        'blockAndAggregate(tuple[])': FunctionFragment;
        'getBlockHash(uint256)': FunctionFragment;
        'getBlockNumber()': FunctionFragment;
        'getCurrentBlockCoinbase()': FunctionFragment;
        'getCurrentBlockDifficulty()': FunctionFragment;
        'getCurrentBlockGasLimit()': FunctionFragment;
        'getCurrentBlockTimestamp()': FunctionFragment;
        'getEthBalance(address)': FunctionFragment;
        'getLastBlockHash()': FunctionFragment;
        'tryAggregate(bool,tuple[])': FunctionFragment;
        'tryBlockAndAggregate(bool,tuple[])': FunctionFragment;
    };

    encodeFunctionData(functionFragment: 'aggregate', values: [{ target: string; callData: BytesLike }[]]): string;
    encodeFunctionData(
        functionFragment: 'blockAndAggregate',
        values: [{ target: string; callData: BytesLike }[]]
    ): string;
    encodeFunctionData(functionFragment: 'getBlockHash', values: [BigNumberish]): string;
    encodeFunctionData(functionFragment: 'getBlockNumber', values?: undefined): string;
    encodeFunctionData(functionFragment: 'getCurrentBlockCoinbase', values?: undefined): string;
    encodeFunctionData(functionFragment: 'getCurrentBlockDifficulty', values?: undefined): string;
    encodeFunctionData(functionFragment: 'getCurrentBlockGasLimit', values?: undefined): string;
    encodeFunctionData(functionFragment: 'getCurrentBlockTimestamp', values?: undefined): string;
    encodeFunctionData(functionFragment: 'getEthBalance', values: [string]): string;
    encodeFunctionData(functionFragment: 'getLastBlockHash', values?: undefined): string;
    encodeFunctionData(
        functionFragment: 'tryAggregate',
        values: [boolean, { target: string; callData: BytesLike }[]]
    ): string;
    encodeFunctionData(
        functionFragment: 'tryBlockAndAggregate',
        values: [boolean, { target: string; callData: BytesLike }[]]
    ): string;

    decodeFunctionResult(functionFragment: 'aggregate', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'blockAndAggregate', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getBlockHash', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getBlockNumber', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getCurrentBlockCoinbase', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getCurrentBlockDifficulty', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getCurrentBlockGasLimit', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getCurrentBlockTimestamp', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getEthBalance', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'getLastBlockHash', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'tryAggregate', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'tryBlockAndAggregate', data: BytesLike): Result;

    events: {};
}

export class Multicall2 extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;

    listeners<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter?: any): Array<any>;
    off<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter: any, listener: any): this;
    on<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter: any, listener: any): this;
    once<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter: any, listener: any): this;
    removeListener<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter: any, listener: any): this;
    removeAllListeners<EventArgsArray extends Array<any>, EventArgsObject>(eventFilter: any): this;

    listeners(eventName?: string): Array<Listener>;
    off(eventName: string, listener: Listener): this;
    on(eventName: string, listener: Listener): this;
    once(eventName: string, listener: Listener): this;
    removeListener(eventName: string, listener: Listener): this;
    removeAllListeners(eventName?: string): this;

    queryFilter<EventArgsArray extends Array<any>, EventArgsObject>(
        event: any,
        fromBlockOrBlockhash?: string | number | undefined,
        toBlock?: string | number | undefined
    ): Promise<Array<TypedEvent<EventArgsArray & EventArgsObject>>>;

    interface: Multicall2Interface;

    functions: {
        aggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        blockAndAggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<[string] & { blockHash: string }>;

        getBlockNumber(overrides?: CallOverrides): Promise<[BigNumber] & { blockNumber: BigNumber }>;

        getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<[string] & { coinbase: string }>;

        getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<[BigNumber] & { difficulty: BigNumber }>;

        getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<[BigNumber] & { gaslimit: BigNumber }>;

        getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<[BigNumber] & { timestamp: BigNumber }>;

        getEthBalance(addr: string, overrides?: CallOverrides): Promise<[BigNumber] & { balance: BigNumber }>;

        getLastBlockHash(overrides?: CallOverrides): Promise<[string] & { blockHash: string }>;

        tryAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        tryBlockAndAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;
    };

    aggregate(
        calls: { target: string; callData: BytesLike }[],
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    blockAndAggregate(
        calls: { target: string; callData: BytesLike }[],
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<string>;

    getBlockNumber(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<string>;

    getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

    getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

    getLastBlockHash(overrides?: CallOverrides): Promise<string>;

    tryAggregate(
        requireSuccess: boolean,
        calls: { target: string; callData: BytesLike }[],
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    tryBlockAndAggregate(
        requireSuccess: boolean,
        calls: { target: string; callData: BytesLike }[],
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    callStatic: {
        aggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: CallOverrides
        ): Promise<[BigNumber, string[]] & { blockNumber: BigNumber; returnData: string[] }>;

        blockAndAggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: CallOverrides
        ): Promise<
            [BigNumber, string, ([boolean, string] & { success: boolean; returnData: string })[]] & {
                blockNumber: BigNumber;
                blockHash: string;
                returnData: ([boolean, string] & {
                    success: boolean;
                    returnData: string;
                })[];
            }
        >;

        getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<string>;

        getBlockNumber(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<string>;

        getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

        getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

        getLastBlockHash(overrides?: CallOverrides): Promise<string>;

        tryAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: CallOverrides
        ): Promise<([boolean, string] & { success: boolean; returnData: string })[]>;

        tryBlockAndAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: CallOverrides
        ): Promise<
            [BigNumber, string, ([boolean, string] & { success: boolean; returnData: string })[]] & {
                blockNumber: BigNumber;
                blockHash: string;
                returnData: ([boolean, string] & {
                    success: boolean;
                    returnData: string;
                })[];
            }
        >;
    };

    filters: {};

    estimateGas: {
        aggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        blockAndAggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

        getBlockNumber(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

        getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

        getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

        getLastBlockHash(overrides?: CallOverrides): Promise<BigNumber>;

        tryAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        tryBlockAndAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;
    };

    populateTransaction: {
        aggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        blockAndAggregate(
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getBlockNumber(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getEthBalance(addr: string, overrides?: CallOverrides): Promise<PopulatedTransaction>;

        getLastBlockHash(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        tryAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        tryBlockAndAggregate(
            requireSuccess: boolean,
            calls: { target: string; callData: BytesLike }[],
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;
    };
}
