import type { BigNumber as BN, BigNumberish, providers, Signer } from 'ethers';
import { ErrorCode } from '@ethersproject/logger';
import { CHAIN_ID } from './constants';

// Disallow missing both of the properties
export type NetworkConnection =
    | { provider: providers.Provider; signer?: undefined }
    | { provider?: undefined; signer: Signer }
    | { provider: providers.Provider; signer: Signer };

export type Address = string;

export type RawTokenAmount<AmountType extends BigNumberish = BN> = {
    token: Address;
    amount: AmountType;
};

// The list of error code is here
// https://docs.ethers.io/v5/troubleshooting/errors/
// The following is done to convert an enum into union.
export type EthersJsErrorCode = ErrorCode[keyof ErrorCode];

export { ChainId } from './constants';
export type MainchainId = typeof CHAIN_ID.ETHEREUM | typeof CHAIN_ID.FUJI;

export type GetField<Obj extends {}, Key, Default = never> = Key extends keyof Obj ? Obj[Key] : Default;
export type RemoveLastOptional<T extends any[]> = T extends [...infer Head, any?] ? Head : T;

/**
 * The below utility types use infer instead of Parameters and ReturnType.
 *
 * Parameters and ReturnType will work fine IF Fn is concrete. If
 * Fn is not concrete, the Parameters and ReturnType could not be properly inferred.
 *
 * For example, the following code failed to inferred the type of the variable x
 *
 *      type A = {
 *          a: () => number;
 *      };
 *      function k<C extends A>() {
 *          type t = ReturnType<C['a']>;
 *          const x: t = 123;
 *          return x;
 *      }
 *
 * Even though we know then signature of A['a'], we actually does not know the signature of C['a'].
 * Considered the following type:
 *
 *      type B = A & {
 *          a: (y: string) => string;
 *      };
 *      console.log(k<B>());
 *
 * B is totally a valid subtype of A, and can even be used with the function k. We can concluded that
 * ReturnType is not concrete enough.
 *
 *
 * Using infer, we can get both parameters type and the return type, as they come **in pair**.
 * Parameters and ReturnType, on the other hand, are not.
 */
export type RemoveLastOptionalParam<Fn extends (...params: any[]) => any> = Fn extends (
    ...params: [...infer Head, any?]
) => infer R
    ? (...params: Head) => R
    : Fn;
export type AddOptionalParam<Fn extends (...params: any[]) => any, P> = Fn extends (...params: infer Params) => infer R
    ? (...params: [...Params, P?]) => R
    : Fn;

export type SyncReturnType<Fn extends (...params: any[]) => Promise<any>> = Awaited<ReturnType<Fn>>;

export type UnionOf<Types> = Types extends [infer Elm]
    ? Elm
    : Types extends [...infer Body, infer Last]
    ? UnionOf<Body> & Last
    : Types;
