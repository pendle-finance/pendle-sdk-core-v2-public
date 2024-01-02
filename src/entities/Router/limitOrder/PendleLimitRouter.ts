import { PendleEntity, PendleEntityConfigOptionalAbi } from '../../PendleEntity';
import * as common from '../../../common';
import * as contracts from '../../../contracts';
import * as contractTypes from '@pendle/core-v2/typechain-types';
import { WrappedContract } from '../../../contracts';
import * as errors from '../../../errors';
import * as iters from 'itertools';
import * as ethers from 'ethers';

import { OrderStruct, FillOrderParamsStruct, OrderStatus } from './types';

export type PendleLimitRouterConfig = PendleEntityConfigOptionalAbi & {
    chainId: common.ChainId;
    version: string;
};

export class PendleLimitRouter extends PendleEntity {
    readonly chainId: common.ChainId;
    readonly version: string;

    constructor(address: common.Address, config: PendleLimitRouterConfig) {
        super(address, { abi: contracts.PendleLimitRouterABI, ...config });
        this.chainId = config.chainId;
        this.version = config.version;
    }

    static getPendleLimitRouter(this: void, config: PendleLimitRouterConfig): PendleLimitRouter {
        const addr = common.getContractAddresses(config.chainId);
        const hasLimitRouterAddr = 'LIMIT_ROUTER' in addr && addr.LIMIT_ROUTER;
        if (!hasLimitRouterAddr) {
            throw new errors.PendleSdkError(`PendleLimitRouter is not deployed on chain ${config.chainId}.`);
        }
        return new PendleLimitRouter(addr.LIMIT_ROUTER, config);
    }

    override get contract(): WrappedContract<contractTypes.PendleLimitRouter> {
        return this._contract as WrappedContract<contractTypes.PendleLimitRouter>;
    }

    get domain() {
        return {
            name: 'Pendle Limit Order Protocol',
            version: this.version,
            chainId: this.chainId,
            verifyingContract: this.address,
        } as const;
    }

    async getOrderStatusesUncheckedWithHashes(
        orders: OrderStruct[],
        hashes: string[],
        params?: contracts.MulticallStaticParams
    ): Promise<(OrderStatus | undefined)[]> {
        const [makerNonces, rawStatuses] = await Promise.all([
            Promise.all(orders.map((o) => this.nonce(o.maker))),
            this.contract.multicallStatic.orderStatusesRaw(hashes, params),
        ]);
        return Array.from(
            common.zip(orders, makerNonces, rawStatuses.remainingsRaw, rawStatuses.filledAmounts),
            ([order, makerNonce, remainingRaw, filledAmount]) => {
                if (remainingRaw.isZero()) return undefined;
                return OrderStatus.create(order, remainingRaw.sub(1), filledAmount, makerNonce);
            }
        );
    }

    async getOrderStatusesUnchecked(
        orders: OrderStruct[],
        params?: contracts.MulticallStaticParams
    ): Promise<(OrderStatus | undefined)[]> {
        const hashes = iters.map(orders, (o) => this.hashOrder(o));
        return this.getOrderStatusesUncheckedWithHashes(orders, hashes, params);
    }

    async getOrderStatuses(orders: OrderStruct[], params?: contracts.MulticallStaticParams): Promise<OrderStatus[]> {
        const res = await this.getOrderStatusesUnchecked(orders, params);
        return res.map((r) =>
            common.assertDefined(r, () => {
                throw new errors.PendleSdkError('Unknown limit order');
            })
        );
    }

    async cancelSingle<T extends contracts.MetaMethodType>(
        order: OrderStruct,
        params?: contracts.MetaMethodExtraParams<T>
    ): Promise<
        contracts.MetaMethodReturnType<T, contractTypes.PendleLimitRouter, 'cancelSingle', NonNullable<unknown>>
    > {
        return this.contract.metaCall.cancelSingle(OrderStruct.toRaw(order), params);
    }

    async cancelBatch<T extends contracts.MetaMethodType>(
        orders: Iterable<OrderStruct>,
        params?: contracts.MetaMethodExtraParams<T>
    ): Promise<
        contracts.MetaMethodReturnType<T, contractTypes.PendleLimitRouter, 'cancelBatch', NonNullable<unknown>>
    > {
        return this.contract.metaCall.cancelBatch(iters.map(orders, OrderStruct.toRaw), params);
    }

    async nonce(userAddress: common.Address, params?: contracts.MulticallStaticParams): Promise<common.BN> {
        return this.contract.multicallStatic.nonce(userAddress, params);
    }

    async fill<T extends contracts.MetaMethodType>(
        fillOrderParams: Iterable<FillOrderParamsStruct>,
        receiver: common.Address,
        maxTaking: common.BN,
        params?: contracts.MetaMethodExtraParams<T> & {
            // can be useful if we do simulation with VoidSigner with address of a contract
            callback?: common.BytesLike;
            optionalData?: common.BytesLike;
        }
    ): contracts.MetaMethodReturnType<T, contractTypes.PendleLimitRouter, 'fill', NonNullable<unknown>> {
        return this.contract.metaCall.fill(
            iters.map(fillOrderParams, FillOrderParamsStruct.toRaw),
            receiver,
            maxTaking,
            params?.optionalData ?? '0x',
            params?.callback ?? '0x',
            params
        );
    }

    /**
     * Sync function to generate sign data so that the user can pick it up and sign it elsewhere.
     * @example
     * const data = PendleLimitRouter.generateTypedDataForSigning(order);
     * const signature = await signer._signTypedData(...data);
     */
    generateTypedDataForSigning(
        order: OrderStruct
    ): [ethers.TypedDataDomain, Record<string, ethers.TypedDataField[]>, OrderStruct.RawOrderStruct] {
        return [this.domain, OrderStruct.TYPED_DATA_FIELDS, OrderStruct.toRaw(order)];
    }

    hashOrder(order: OrderStruct) {
        return ethers.utils._TypedDataEncoder.hash(
            this.domain,
            OrderStruct.TYPED_DATA_FIELDS,
            OrderStruct.toRaw(order)
        );
    }

    async signOrder(order: OrderStruct): Promise<common.BytesLike> {
        const signer = common.assertDefined(this.contract.signer, () => {
            throw errors.SignerRequired.create('signing order');
        });
        if (!('_signTypedData' in signer) || signer._signTypedData == undefined) {
            throw errors.TypedDataSignerRequired.create('TypedDataSigner is required');
        }
        if ((await signer.getAddress().then(common.toAddress)) !== order.maker) {
            throw new errors.PendleSdkError('Signer is not the maker');
        }
        // Casting as the following is actually wrong.
        // But Ethers.js does not expose `TypedDataSigner`, so we cast to one that inherit it.
        const typedDataSigner = signer as ethers.providers.JsonRpcSigner;
        const signature = await typedDataSigner._signTypedData(...this.generateTypedDataForSigning(order));
        return signature;
    }
}
