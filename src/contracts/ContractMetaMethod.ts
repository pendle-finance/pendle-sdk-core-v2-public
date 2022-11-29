import { Contract, BigNumber as BN } from 'ethers';
import { Multicall } from '../multicall';
import {
    WrappedContract,
    MetaMethodType,
    MetaMethodExtraParams,
    MetaMethodReturnType,
    ContractMethodNames,
    Signer,
    Provider,
    EthersContractMethod,
} from './types';
import { MulticallStaticParams } from './types';
import { calcSlippedUpAmount } from '../common/math';

export type ContractMetaMethodCallback = <
    T extends MetaMethodType,
    C extends Contract,
    MethodName extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
>(
    methodType: T,
    method: EthersContractMethod<C, T, MethodName>,
    data: Data,
    contractMetaMethod: ContractMetaMethod<C, MethodName, Data>
) => MetaMethodReturnType<T, C, MethodName, Data>;

export class ContractMetaMethod<
    C extends Contract,
    M extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
> {
    static DEFAULT_GAS_LIMIT_BUFFERING_PERCENT = 10;
    constructor(
        readonly contract: WrappedContract<C>,
        readonly methodName: M,
        readonly callback: ContractMetaMethodCallback,
        readonly data: Data
    ) {}

    private addOverridesToData(dataOverrides?: MetaMethodExtraParams): Data {
        return {
            ...this.data,
            ...dataOverrides,
            overrides: {
                ...this.data.overrides,
                ...dataOverrides?.overrides,
            },
        };
    }

    withContract(newContract: WrappedContract<C>): ContractMetaMethod<C, M, Data> {
        return new ContractMetaMethod(newContract, this.methodName, this.callback, this.data);
    }

    connect(signerOrProvider: Signer | Provider) {
        const newContract = this.contract.connect(signerOrProvider);
        return this.withContract(newContract);
    }

    async send(dataOverrides?: MetaMethodExtraParams): MetaMethodReturnType<'send', C, M, Data> {
        const data = this.addOverridesToData(dataOverrides);
        const gas = await (data.overrides?.gasLimit ??
            this.estimateGas({ ...dataOverrides, overrides: { ...dataOverrides, gasLimit: undefined } }));
        const bufferedGas = calcSlippedUpAmount(
            BN.from(gas),
            (data.gasLimitBufferingPercent ?? ContractMetaMethod.DEFAULT_GAS_LIMIT_BUFFERING_PERCENT) / 100
        );

        data.overrides = { ...data.overrides, gasLimit: bufferedGas };

        return await this.callback(
            'send',
            this.contract.functions[this.methodName as string] as EthersContractMethod<C, 'send', M>,
            data,
            this
        );
    }

    callStatic(dataOverrides?: MetaMethodExtraParams): MetaMethodReturnType<'callStatic', C, M, Data> {
        return this.callback(
            'callStatic',
            this.contract.callStatic[this.methodName as string] as EthersContractMethod<C, 'callStatic', M>,
            this.addOverridesToData(dataOverrides),
            this
        );
    }

    /**
     * Note:
     * When the overrides has only blockTag property (that is, when Multicall.isMulticallOverrides(overrides) is true),
     * multicall is used. Otherwise callStatic is used.
     */
    multicallStatic(
        multicallStaticParams: MulticallStaticParams = {}
    ): MetaMethodReturnType<'multicallStatic', C, M, Data> {
        const data = this.addOverridesToData(multicallStaticParams);
        const multicall = data.multicall;
        // TODO make this some how use the same logic as contract.multicallStatic
        const callback = ((...args: any[]) => {
            const argCount = this.contract.functionFragmentsMapping[this.methodName].inputs.length;
            let overrides = (args.length === argCount + 1 ? args.pop() : undefined) ?? {};
            return Multicall.wrap(this.contract, multicall).callStatic[this.methodName as string](
                ...(args as any),
                overrides
            );
        }) as EthersContractMethod<C, 'multicallStatic', M>;
        return this.callback('multicallStatic', callback, data, this);
    }

    estimateGas(dataOverrides?: MetaMethodExtraParams): MetaMethodReturnType<'estimateGas', C, M, Data> {
        return this.callback(
            'estimateGas',
            this.contract.estimateGas[this.methodName as string] as EthersContractMethod<C, 'estimateGas', M>,
            this.addOverridesToData(dataOverrides),
            this
        );
    }

    static utils = {
        getContractSignerAddress<C extends Contract>(contractMetaMethod: ContractMetaMethod<C, any, {}>) {
            return contractMetaMethod.contract.signer.getAddress();
        },
    };
}

export function callMetaMethod<
    C extends Contract,
    M extends ContractMethodNames<C>,
    T extends MetaMethodType,
    Data extends MetaMethodExtraParams<T>
>(
    contract: WrappedContract<C>,
    methodName: M,
    callback: ContractMetaMethodCallback,
    data?: Data
): MetaMethodReturnType<NonNullable<T>, C, M, Data> {
    const method = data?.method ?? 'send';
    const metaMethod = new ContractMetaMethod(contract, methodName, callback, { ...data });
    if (method === 'meta-method') return metaMethod as any;
    if (method === 'callStatic') return metaMethod.callStatic() as any;
    if (method === 'estimateGas') return metaMethod.estimateGas() as any;
    if (method === 'multicallStatic') return metaMethod.multicallStatic() as any;
    return metaMethod.send() as any;
}
