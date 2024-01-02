import * as multicall from '../../multicall';
// import { IPAllActionV3 } from './types';
// import { WrappedContract } from '../../contracts';
import { PendleSdkError } from '../../errors';
import { BN } from '../../common';
// import * as iters from 'itertools';
// import * as ethers from 'ethers';

// const ROUTER_SELF_DELEGATE_MULTICALL_CALL_THEN_REVERT_ERROR_FRAGMENT = ethers.utils.ErrorFragment.from(
//     'CallThenRevertError(bool success, bytes returnData)'
// );

// const EMPTY_CONTRACT_INTERFACE = new ethers.utils.Interface([]);

export class RouterSelfDelegateMulticallAggregateCallerError extends PendleSdkError {}

export type RouterSelfDelegateMulticallAggregateCallResult = multicall.Result & {
    gasUsed: BN;
};

// TODO implement this. Comment this to avoid compilation error.
// export class RouterSelfDelegateMulticallAggregateCaller implements multicall.MulticallAggregateCaller {
//     constructor(readonly routerContract: WrappedContract<IPAllActionV3>, readonly gasUsedPerCall: number) {}
//     async tryAggregate(
//         calls: multicall.Calls[],
//         overrides?: { blockTag?: ethers.providers.BlockTag }
//     ): Promise<RouterSelfDelegateMulticallAggregateCallResult[]> {
//         if (iters.any(calls, (call) => call.target !== this.routerContract.address)) {
//             throw new RouterSelfDelegateMulticallAggregateCallerError('mismatch target address');
//         }
//         const totalGasLimit = this.gasUsedPerCall * calls.length;
//         const data = calls.map((call) => call.callData);
//         const { res, gasUsed } = await this.routerContract.callStatic.multicallRevert(totalGasLimit, data, overrides);
//         const decodedResult = res.map(
//             (r) =>
//                 EMPTY_CONTRACT_INTERFACE.decodeErrorResult(
//                     ROUTER_SELF_DELEGATE_MULTICALL_CALL_THEN_REVERT_ERROR_FRAGMENT,
//                     r
//                 ) as unknown as {
//                     success: boolean;
//                     returnData: string;
//                 }
//         );
//         return iters.map(iters.zip(decodedResult, gasUsed), ([res, gasUsed]) => ({ ...res, gasUsed }));
//     }
// }
//
// // TODO
// export class RouterSelfDelegateMulticall extends multicall.Multicall {}
