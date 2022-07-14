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
import type { TypedEventFilter, TypedEvent, TypedListener } from './common';

interface AirdropInterface extends ethers.utils.Interface {
    functions: {
        'allowETH(address,uint256)': FunctionFragment;
        'alowERC20(address,address,uint256)': FunctionFragment;
        'balanceETH(address)': FunctionFragment;
        'balanceOf(address,address)': FunctionFragment;
        'claim(address[],uint256[],bool,uint256)': FunctionFragment;
        'claimAll()': FunctionFragment;
        'owner()': FunctionFragment;
        'renounceOwnership()': FunctionFragment;
        'transferOwnership(address)': FunctionFragment;
    };

    encodeFunctionData(functionFragment: 'allowETH', values: [string, BigNumberish]): string;
    encodeFunctionData(functionFragment: 'alowERC20', values: [string, string, BigNumberish]): string;
    encodeFunctionData(functionFragment: 'balanceETH', values: [string]): string;
    encodeFunctionData(functionFragment: 'balanceOf', values: [string, string]): string;
    encodeFunctionData(functionFragment: 'claim', values: [string[], BigNumberish[], boolean, BigNumberish]): string;
    encodeFunctionData(functionFragment: 'claimAll', values?: undefined): string;
    encodeFunctionData(functionFragment: 'owner', values?: undefined): string;
    encodeFunctionData(functionFragment: 'renounceOwnership', values?: undefined): string;
    encodeFunctionData(functionFragment: 'transferOwnership', values: [string]): string;

    decodeFunctionResult(functionFragment: 'allowETH', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'alowERC20', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'balanceETH', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'balanceOf', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'claim', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'claimAll', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'owner', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'renounceOwnership', data: BytesLike): Result;
    decodeFunctionResult(functionFragment: 'transferOwnership', data: BytesLike): Result;

    events: {
        'OwnershipTransferred(address,address)': EventFragment;
        'Setting(address,string,uint256)': EventFragment;
        'SettingETH(address,uint256)': EventFragment;
        'Transfer(address,string,uint256)': EventFragment;
        'TransferETH(address,uint256)': EventFragment;
    };

    getEvent(nameOrSignatureOrTopic: 'OwnershipTransferred'): EventFragment;
    getEvent(nameOrSignatureOrTopic: 'Setting'): EventFragment;
    getEvent(nameOrSignatureOrTopic: 'SettingETH'): EventFragment;
    getEvent(nameOrSignatureOrTopic: 'Transfer'): EventFragment;
    getEvent(nameOrSignatureOrTopic: 'TransferETH'): EventFragment;
}

export type OwnershipTransferredEvent = TypedEvent<[string, string] & { previousOwner: string; newOwner: string }>;

export type SettingEvent = TypedEvent<
    [string, string, BigNumber] & {
        receipt: string;
        token: string;
        amount: BigNumber;
    }
>;

export type SettingETHEvent = TypedEvent<[string, BigNumber] & { receipt: string; amount: BigNumber }>;

export type TransferEvent = TypedEvent<
    [string, string, BigNumber] & {
        receipt: string;
        token: string;
        amount: BigNumber;
    }
>;

export type TransferETHEvent = TypedEvent<[string, BigNumber] & { recept: string; amount: BigNumber }>;

export class Airdrop extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;

    listeners<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter?: TypedEventFilter<EventArgsArray, EventArgsObject>
    ): Array<TypedListener<EventArgsArray, EventArgsObject>>;
    off<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter: TypedEventFilter<EventArgsArray, EventArgsObject>,
        listener: TypedListener<EventArgsArray, EventArgsObject>
    ): this;
    on<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter: TypedEventFilter<EventArgsArray, EventArgsObject>,
        listener: TypedListener<EventArgsArray, EventArgsObject>
    ): this;
    once<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter: TypedEventFilter<EventArgsArray, EventArgsObject>,
        listener: TypedListener<EventArgsArray, EventArgsObject>
    ): this;
    removeListener<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter: TypedEventFilter<EventArgsArray, EventArgsObject>,
        listener: TypedListener<EventArgsArray, EventArgsObject>
    ): this;
    removeAllListeners<EventArgsArray extends Array<any>, EventArgsObject>(
        eventFilter: TypedEventFilter<EventArgsArray, EventArgsObject>
    ): this;

    listeners(eventName?: string): Array<Listener>;
    off(eventName: string, listener: Listener): this;
    on(eventName: string, listener: Listener): this;
    once(eventName: string, listener: Listener): this;
    removeListener(eventName: string, listener: Listener): this;
    removeAllListeners(eventName?: string): this;

    queryFilter<EventArgsArray extends Array<any>, EventArgsObject>(
        event: TypedEventFilter<EventArgsArray, EventArgsObject>,
        fromBlockOrBlockhash?: string | number | undefined,
        toBlock?: string | number | undefined
    ): Promise<Array<TypedEvent<EventArgsArray & EventArgsObject>>>;

    interface: AirdropInterface;

    functions: {
        allowETH(
            receipt: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        alowERC20(
            receipt: string,
            token: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        balanceETH(receipt: string, overrides?: CallOverrides): Promise<[BigNumber]>;

        balanceOf(receipt: string, token: string, overrides?: CallOverrides): Promise<[BigNumber]>;

        claim(
            tokens: string[],
            amounts: BigNumberish[],
            eth: boolean,
            ethAmount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;

        claimAll(overrides?: Overrides & { from?: string | Promise<string> }): Promise<ContractTransaction>;

        owner(overrides?: CallOverrides): Promise<[string]>;

        renounceOwnership(overrides?: Overrides & { from?: string | Promise<string> }): Promise<ContractTransaction>;

        transferOwnership(
            newOwner: string,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<ContractTransaction>;
    };

    allowETH(
        receipt: string,
        amount: BigNumberish,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    alowERC20(
        receipt: string,
        token: string,
        amount: BigNumberish,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    balanceETH(receipt: string, overrides?: CallOverrides): Promise<BigNumber>;

    balanceOf(receipt: string, token: string, overrides?: CallOverrides): Promise<BigNumber>;

    claim(
        tokens: string[],
        amounts: BigNumberish[],
        eth: boolean,
        ethAmount: BigNumberish,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    claimAll(overrides?: Overrides & { from?: string | Promise<string> }): Promise<ContractTransaction>;

    owner(overrides?: CallOverrides): Promise<string>;

    renounceOwnership(overrides?: Overrides & { from?: string | Promise<string> }): Promise<ContractTransaction>;

    transferOwnership(
        newOwner: string,
        overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    callStatic: {
        allowETH(receipt: string, amount: BigNumberish, overrides?: CallOverrides): Promise<void>;

        alowERC20(receipt: string, token: string, amount: BigNumberish, overrides?: CallOverrides): Promise<void>;

        balanceETH(receipt: string, overrides?: CallOverrides): Promise<BigNumber>;

        balanceOf(receipt: string, token: string, overrides?: CallOverrides): Promise<BigNumber>;

        claim(
            tokens: string[],
            amounts: BigNumberish[],
            eth: boolean,
            ethAmount: BigNumberish,
            overrides?: CallOverrides
        ): Promise<void>;

        claimAll(overrides?: CallOverrides): Promise<void>;

        owner(overrides?: CallOverrides): Promise<string>;

        renounceOwnership(overrides?: CallOverrides): Promise<void>;

        transferOwnership(newOwner: string, overrides?: CallOverrides): Promise<void>;
    };

    filters: {
        'OwnershipTransferred(address,address)'(
            previousOwner?: string | null,
            newOwner?: string | null
        ): TypedEventFilter<[string, string], { previousOwner: string; newOwner: string }>;

        OwnershipTransferred(
            previousOwner?: string | null,
            newOwner?: string | null
        ): TypedEventFilter<[string, string], { previousOwner: string; newOwner: string }>;

        'Setting(address,string,uint256)'(
            receipt?: null,
            token?: null,
            amount?: null
        ): TypedEventFilter<[string, string, BigNumber], { receipt: string; token: string; amount: BigNumber }>;

        Setting(
            receipt?: null,
            token?: null,
            amount?: null
        ): TypedEventFilter<[string, string, BigNumber], { receipt: string; token: string; amount: BigNumber }>;

        'SettingETH(address,uint256)'(
            receipt?: null,
            amount?: null
        ): TypedEventFilter<[string, BigNumber], { receipt: string; amount: BigNumber }>;

        SettingETH(
            receipt?: null,
            amount?: null
        ): TypedEventFilter<[string, BigNumber], { receipt: string; amount: BigNumber }>;

        'Transfer(address,string,uint256)'(
            receipt?: null,
            token?: null,
            amount?: null
        ): TypedEventFilter<[string, string, BigNumber], { receipt: string; token: string; amount: BigNumber }>;

        Transfer(
            receipt?: null,
            token?: null,
            amount?: null
        ): TypedEventFilter<[string, string, BigNumber], { receipt: string; token: string; amount: BigNumber }>;

        'TransferETH(address,uint256)'(
            recept?: null,
            amount?: null
        ): TypedEventFilter<[string, BigNumber], { recept: string; amount: BigNumber }>;

        TransferETH(
            recept?: null,
            amount?: null
        ): TypedEventFilter<[string, BigNumber], { recept: string; amount: BigNumber }>;
    };

    estimateGas: {
        allowETH(
            receipt: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        alowERC20(
            receipt: string,
            token: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        balanceETH(receipt: string, overrides?: CallOverrides): Promise<BigNumber>;

        balanceOf(receipt: string, token: string, overrides?: CallOverrides): Promise<BigNumber>;

        claim(
            tokens: string[],
            amounts: BigNumberish[],
            eth: boolean,
            ethAmount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;

        claimAll(overrides?: Overrides & { from?: string | Promise<string> }): Promise<BigNumber>;

        owner(overrides?: CallOverrides): Promise<BigNumber>;

        renounceOwnership(overrides?: Overrides & { from?: string | Promise<string> }): Promise<BigNumber>;

        transferOwnership(
            newOwner: string,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<BigNumber>;
    };

    populateTransaction: {
        allowETH(
            receipt: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        alowERC20(
            receipt: string,
            token: string,
            amount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        balanceETH(receipt: string, overrides?: CallOverrides): Promise<PopulatedTransaction>;

        balanceOf(receipt: string, token: string, overrides?: CallOverrides): Promise<PopulatedTransaction>;

        claim(
            tokens: string[],
            amounts: BigNumberish[],
            eth: boolean,
            ethAmount: BigNumberish,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;

        claimAll(overrides?: Overrides & { from?: string | Promise<string> }): Promise<PopulatedTransaction>;

        owner(overrides?: CallOverrides): Promise<PopulatedTransaction>;

        renounceOwnership(overrides?: Overrides & { from?: string | Promise<string> }): Promise<PopulatedTransaction>;

        transferOwnership(
            newOwner: string,
            overrides?: Overrides & { from?: string | Promise<string> }
        ): Promise<PopulatedTransaction>;
    };
}
