import { PendleEntity, PendleEntityConfigOptionalAbi } from '../PendleEntity';
import {
    PendleERC20,
    PendleERC20ABI,
    MetaMethodType,
    WrappedContract,
    MetaMethodExtraParams,
    MulticallStaticParams,
    MetaMethodReturnType,
    ContractMethodNames,
} from '../../contracts';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { Address } from '../../common';
import { ERC20Like } from './ERC20Like';

/**
 * The configuration for an `ERC20` entity. As `ERC20` extends `PendleEntity`,
 * its config should be the subtype of `PendleEntity`'s config type.
 */
export type ERC20EntityConfig = PendleEntityConfigOptionalAbi;

/**
 * Return type shorthand for the write methods of {@link ERC20Entity}
 */
export type ERC20EntityMetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<PendleERC20>,
    ExtraData extends {} = {}
> = MetaMethodReturnType<T, PendleERC20, MethodName, ExtraData & MetaMethodExtraParams<T>>;

/**
 * This class represents an ERC20 token
 */
export class ERC20Entity extends PendleEntity implements ERC20Like {
    /**
     * @param address - the inner contract address
     * @param config - the entity configuration.
     */
    constructor(readonly address: Address, config: ERC20EntityConfig) {
        super(address, { abi: PendleERC20ABI, ...config });
    }

    /**
     * `this._contract` but with the casted type.
     *
     * @see PendleEntity#_contract
     */
    get contract(): WrappedContract<PendleERC20> {
        return this._contract as WrappedContract<PendleERC20>;
    }

    /**
     * Get the allowance
     * @param owner - the owner's address
     * @param spender - the spender's address
     * @param param - the additional parameters for read method.
     * @returns the balance of the user
     */
    allowance(owner: Address, spender: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.allowance(owner, spender, params);
    }

    /**
     * Get the balance of an user, given the account
     * @param account - the account address of the user
     * @param params - the additional parameters for read method.
     * @returns the balance of the user
     */
    balanceOf(account: Address, params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.balanceOf(account, params);
    }

    /**
     * Get the decimals of the token
     * @param params - the additional parameters for read method.
     * @returns the decimals of the token.
     */
    decimals(params?: MulticallStaticParams): Promise<number> {
        return this.contract.multicallStatic.decimals(params);
    }

    /**
     * Get the name of the token
     * @param params - the additional parameters for read method.
     * @returns the name of the token.
     */
    name(params?: MulticallStaticParams): Promise<string> {
        return this.contract.multicallStatic.name(params);
    }

    /**
     * Get the symbol of the token
     * @param params - the additional parameters for read method.
     * @returns the symbol of the token.
     */
    symbol(params?: MulticallStaticParams): Promise<string> {
        return this.contract.multicallStatic.symbol(params);
    }

    /**
     * Get the total supply of the token
     * @param params - the additional parameters for read method.
     * @returns the total supply of the token.
     */
    totalSupply(params?: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.totalSupply(params);
    }

    /**
     * Perform ERC20's `approve` method.
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param spender - the spender's Address
     * @param amount - the amount to approve
     * @param params - the additional parameters for **write** method.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined, this
     * method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async approve<T extends MetaMethodType>(
        spender: Address,
        amount: BigNumberish,
        params: MetaMethodExtraParams<T> = {}
    ): ERC20EntityMetaMethodReturnType<T, 'approve'> {
        return this.contract.metaCall.approve(spender, amount, this.addExtraParams(params));
    }

    /**
     * Perform ERC20's `transfer` method.
     * @typeParam T - the type of the meta method. This should be infer by `tsc` to
     *      determine the correct return type. See
     *      [ERC20 contract interaction tutorial with Pendle SDK](https://github.com/pendle-finance/pendle-sdk-core-v2-docs/blob/main/rendered-docs/docs/erc20-tutorial.md)
     *      to see the example usage with explanation.
     * @param to - the receiver's Address
     * @param amount - the amount to transfer
     * @param params - the additional parameters for **write** method.
     * @returns
     *
     * When `params` is not defined, or when `params.method` is not defined,
     * this method will perform the transaction, and return
     * `Promise<ethers.ContractTransaction>`.
     *
     * Otherwise, `params.method`'s value is used to determine the return type.
     * See {@link MetaMethodReturnType} for the detailed explanation of the return type.
     */
    async transfer<T extends MetaMethodType>(
        to: Address,
        amount: BigNumberish,
        params: MetaMethodExtraParams<T> = {}
    ): ERC20EntityMetaMethodReturnType<T, 'transfer'> {
        return this.contract.metaCall.transfer(to, amount, this.addExtraParams(params));
    }
}
