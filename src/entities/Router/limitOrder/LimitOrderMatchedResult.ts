import { BN, Address, NATIVE_ADDRESS_0x00, ChainId, getContractAddresses, BytesLike } from '../../../common';
import * as offchainMath from '@pendle/core-v2-offchain-math';
import * as errors from '../../../errors';

import { FillOrderParamsStruct, LimitOrderDataStruct } from './types';

export class LimitOrderMatchedResult {
    constructor(
        readonly normalFills: ReadonlyArray<FillOrderParamsStruct.FillOrderParamsStruct>,
        readonly flashFills: ReadonlyArray<FillOrderParamsStruct.FillOrderParamsStruct>,

        readonly netOutputToTaker: BN,
        readonly netInputFromTaker: BN,
        readonly totalFee: BN,

        readonly epsSkipMarket: offchainMath.FixedX18,
        readonly optData: BytesLike
    ) {}

    static create(params: {
        normalFills: ReadonlyArray<FillOrderParamsStruct>;
        flashFills: ReadonlyArray<FillOrderParamsStruct>;

        netOutputToTaker: BN;
        netInputFromTaker: BN;
        totalFee: BN;

        epsSkipMarket?: offchainMath.FixedX18;
        optData?: BytesLike;
    }): LimitOrderMatchedResult {
        return new LimitOrderMatchedResult(
            params.normalFills,
            params.flashFills,

            params.netOutputToTaker,
            params.netInputFromTaker,
            params.totalFee,

            params.epsSkipMarket ?? offchainMath.FixedX18.ZERO,
            params.optData ?? '0x'
        );
    }

    static readonly EMPTY = LimitOrderMatchedResult.create({
        normalFills: [],
        flashFills: [],
        netOutputToTaker: BN.from(0),
        netInputFromTaker: BN.from(0),
        totalFee: BN.from(0),
        epsSkipMarket: offchainMath.FixedX18.ZERO,
    });

    isEmpty() {
        return this.normalFills.length === 0 && this.flashFills.length === 0;
    }

    toRawLimitOrderDataStruct(
        limitRouter: Address,
        params?: {
            emptyCheck?: boolean;
        }
    ): LimitOrderDataStruct.RawLimitOrderDataStruct {
        const { emptyCheck = true } = params ?? {};
        if (emptyCheck && this.isEmpty()) limitRouter = NATIVE_ADDRESS_0x00;
        return {
            limitRouter: limitRouter,
            epsSkipMarket: this.epsSkipMarket.value,
            normalFills: this.normalFills.map(FillOrderParamsStruct.toRaw),
            flashFills: this.flashFills.map(FillOrderParamsStruct.toRaw),
            optData: this.optData,
        };
    }

    toRawLimitOrderDataStructForChain(chainId: ChainId) {
        if (this.isEmpty()) return this.toRawLimitOrderDataStruct(NATIVE_ADDRESS_0x00);
        const limitOrderRouter = getContractAddresses(chainId).LIMIT_ROUTER;
        if (!limitOrderRouter) {
            throw new errors.PendleSdkError(`Limit order is not supported for chain ${chainId}`);
        }
        return this.toRawLimitOrderDataStruct(limitOrderRouter);
    }
}
