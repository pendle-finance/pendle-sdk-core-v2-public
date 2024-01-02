import { type BaseRouter } from './BaseRouter';
import { BytesLike, PopulatedTransaction } from 'ethers';
import { ContractMetaMethodUtilFunction, ContractMetaMethod, MetaMethodType } from '../../contracts';
import { PendleSdkError } from '../../errors';
import { IPAllActionV3, RouterMetaMethodExtraParams, RouterMetaMethodReturnType } from './types';

export type RouterTransactionBundlerItem = {
    allowFailure: boolean;
    callData: BytesLike | ContractMetaMethodUtilFunction<Promise<BytesLike>, IPAllActionV3>;
};

/**
 * Helper class for
 * [`batchExec`](https://github.com/pendle-finance/pendle-core-v2-public/blob/main/contracts/router/ActionMisc.sol#L23)
 * contract function.
 * @remarks
 * This helper class allow the consumer to use `batchExec` of PendleRouter
 * contract with PendleSdk contract meta method.
 *
 * Note that this object is **mutable**. If a meta-method is built with this
 * class (via `.execute({ method: 'meta-method'})`), and then call `.send()`
 * method of that meta-method, **ALL** item added to this class prior to
 * `.send()` call **will be included**.
 *
 * @example
 * ```ts
 * const myRouter = Router.getRouter({...});
 * const transactionBundler = myRouter.createTransactionBundler();
 *
 * await transactionBundler
 *      .addPopulatedTransaction(myRouter.swapExactTokenForPt(
 *          market, tokenIn, amountIn, slippage, { method: 'populateTransaction '}
 *      ))
 *      .addContractMetaMethod(myRouter.swapExactPtForYt(
 *          market, netPtIn, slippage, { method: 'meta-method' }
 *      ))
 *      .execute();
 * ```
 *
 */
export class RouterTransactionBundler {
    readonly items: RouterTransactionBundlerItem[] = [];
    constructor(readonly router: BaseRouter) {}

    addCallData(callData: BytesLike, allowFailure = false): this {
        this.items.push({ allowFailure, callData });
        return this;
    }

    addPopulatedTransaction(populatedTransaction: PopulatedTransaction, allowFailure = false): this {
        this.verifyPopulatedTransaction(populatedTransaction);
        return this.addCallData(populatedTransaction.data, allowFailure);
    }

    /**
     * @privateRemarks
     * Instead of populating the contract right when this method is called, we pass in a callback
     * so it can be built later, _even with a new contract_.
     *
     * This is done because some contract meta method might also used `ContractMethodMethod.utils`
     * to get the other information right before sending (e.g the signer address). The callback
     * here has the same principle (hence it has the type {@link ContractMetaMethodUtilFunction}).
     */
    addContractMetaMethod(contractMetaMethod: ContractMetaMethod<IPAllActionV3, any, any>, allowFailure = false): this {
        this.items.push({
            allowFailure,
            callData: async (mainContractMetaMethod) => {
                const populateTransaction = await contractMetaMethod
                    .withContract(mainContractMetaMethod.contract)
                    .populateTransaction();
                this.verifyPopulatedTransaction(populateTransaction);
                return populateTransaction.data;
            },
        });
        return this;
    }

    /**
     * @privateRemarks
     * Consideration: Add data to the returned contract meta method.
     *
     * But in principle, the return one should not contain additional data, as the
     * component meta methods already contains them, and the consumer should access
     * those data from the component meta methods.
     */
    execute<T extends MetaMethodType>(
        _params: RouterMetaMethodExtraParams<T> = {}
    ): RouterMetaMethodReturnType<T, 'multicall'> {
        return this.router.contract.metaCall.multicall(
            (mainContractMetaMethod) =>
                Promise.all(
                    this.items.map(async (item) => ({
                        allowFailure: item.allowFailure,
                        callData:
                            typeof item.callData === 'function'
                                ? await item.callData(mainContractMetaMethod)
                                : item.callData,
                    }))
                ),
            this.router.addExtraParams(_params)
        );
    }

    protected verifyPopulatedTransaction(
        populatedTransaction: PopulatedTransaction
    ): asserts populatedTransaction is PopulatedTransaction & { data: BytesLike } {
        if (populatedTransaction.data == undefined) {
            // TODO make an error class (?)
            throw new PendleSdkError('Call data is required from a populated transaction to be bundled');
        }
    }
}
