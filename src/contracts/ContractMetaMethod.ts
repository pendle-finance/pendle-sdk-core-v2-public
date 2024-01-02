import { Contract } from 'ethers';
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
    CalcBufferedGasFunction,
} from './types';
import { MulticallStaticParams } from './types';
import { BN, bnMax, calcSlippedUpAmount, Address, toAddress, CHAIN_ID_MAPPING } from '../common';

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

export type ContractMetaMethodUtilFunction<Data, C extends Contract = Contract> = (
    contractMetaMethod: ContractMetaMethod<C, any, any>
) => Data;

export class ContractMetaMethod<
    C extends Contract,
    M extends ContractMethodNames<C>,
    Data extends MetaMethodExtraParams<any>
> {
    static calcBufferedGas: CalcBufferedGasFunction = async (estimatedGasUsed, context) => {
        const network = await context.contract.provider.getNetwork();
        if (network.chainId === CHAIN_ID_MAPPING.ARBITRUM) {
            return bnMax(calcSlippedUpAmount(estimatedGasUsed, 0.3), estimatedGasUsed.add(300_000));
        }
        return bnMax(calcSlippedUpAmount(estimatedGasUsed, 0.1), estimatedGasUsed.add(100_000));
    };

    constructor(
        readonly contract: WrappedContract<C>,
        readonly methodName: M,
        readonly callback: ContractMetaMethodCallback,
        readonly data: Data
    ) {}

    withData<NewData extends MetaMethodExtraParams<any>>(newData: NewData): ContractMetaMethod<C, M, NewData> {
        return new ContractMetaMethod(this.contract, this.methodName, this.callback, newData);
    }

    attachExtraData<ExtraData extends object>(extraData: ExtraData): ContractMetaMethod<C, M, Data & ExtraData> {
        return this.withData({ ...this.data, ...extraData });
    }

    static attachExtraData<
        T extends MetaMethodType,
        C extends Contract,
        MethodName extends ContractMethodNames<C>,
        Data extends MetaMethodExtraParams<T>,
        ExtraData extends object
    >(
        obj: Awaited<MetaMethodReturnType<T, C, MethodName, Data>>,
        extraData: ExtraData
    ): Awaited<MetaMethodReturnType<T, C, MethodName, Data & ExtraData>> {
        if (obj instanceof ContractMetaMethod) {
            return obj.attachExtraData(extraData);
        }
        return obj as any;
    }

    /**
     * @remarks
     * This function tries to keeps the `obj` of type `MetaMethodReturnType` as
     * generic as possible. If a variable of type `MetaMethodReturnType` is
     * being _awaited_, the _generic_ type will be _collapsed_, hence the type
     * checking might failed.
     */
    static async attachExtraDataAsync<
        T extends MetaMethodType,
        C extends Contract,
        MethodName extends ContractMethodNames<C>,
        Data extends MetaMethodExtraParams<T>,
        ExtraData extends object
    >(
        obj: MetaMethodReturnType<T, C, MethodName, Data>,
        extraData: ExtraData
    ): MetaMethodReturnType<T, C, MethodName, Data & ExtraData> {
        const res = await obj;
        return this.attachExtraData(res, extraData);
    }

    private addOverridesToData(dataOverrides?: MetaMethodExtraParams<MetaMethodType>): Data {
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

    async send(dataOverrides?: MetaMethodExtraParams<'send'>): MetaMethodReturnType<'send', C, M, Data> {
        const data = this.addOverridesToData(dataOverrides);
        const gas = await (data.overrides?.gasLimit ??
            this.estimateGas({
                ...dataOverrides,
                method: 'estimateGas',
                overrides: { ...dataOverrides?.overrides, gasLimit: undefined },
            }));

        const calcBufferedGas = data.calcBufferedGas ?? ContractMetaMethod.calcBufferedGas;
        const bufferedGas = await calcBufferedGas(BN.from(gas), this);

        data.overrides = { ...data.overrides, gasLimit: bufferedGas };

        // console.log(await this.populateTransaction(dataOverrides));

        return this.callback(
            'send',
            this.contract.functions[this.methodName as string] as EthersContractMethod<C, 'send', M>,
            data,
            this
        );
    }

    callStatic(dataOverrides?: MetaMethodExtraParams<'callStatic'>): MetaMethodReturnType<'callStatic', C, M, Data> {
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
            const overrides = (args.length === argCount + 1 ? args.pop() : undefined) ?? {};
            return Multicall.wrap(this.contract, multicall).callStatic[this.methodName as string](
                ...(args as any),
                overrides
            );
        }) as EthersContractMethod<C, 'multicallStatic', M>;
        return this.callback('multicallStatic', callback, data, this);
    }

    estimateGas(dataOverrides?: MetaMethodExtraParams<'estimateGas'>): MetaMethodReturnType<'estimateGas', C, M, Data> {
        return this.callback(
            'estimateGas',
            this.contract.estimateGas[this.methodName as string] as EthersContractMethod<C, 'estimateGas', M>,
            this.addOverridesToData(dataOverrides),
            this
        );
    }

    populateTransaction(
        dataOverrides?: MetaMethodExtraParams<'populateTransaction'>
    ): MetaMethodReturnType<'populateTransaction', C, M, Data> {
        return this.callback(
            'populateTransaction',
            this.contract.populateTransaction[this.methodName as string] as EthersContractMethod<
                C,
                'populateTransaction',
                M
            >,
            this.addOverridesToData(dataOverrides),
            this
        );
    }

    extractParams(
        dataOverrides?: MetaMethodExtraParams<'extractParams'>
    ): MetaMethodReturnType<'extractParams', C, M, Data> {
        return this.callback(
            'extractParams',
            ((...args: any[]) => args) as any,
            this.addOverridesToData(dataOverrides),
            this
        );
    }

    // Currently this one does not support adding data to meta method.
    // Tho a better way is to call attachExtraData first.
    executeWithMethod<T extends MetaMethodType>(params?: {
        method?: T;
    }): MetaMethodReturnType<T, C, M, Data & { method: T }>;
    executeWithMethod(params?: {
        method?: MetaMethodType;
    }):
        | MetaMethodReturnType<'meta-method', C, M, Data>
        | MetaMethodReturnType<'callStatic', C, M, Data>
        | MetaMethodReturnType<'estimateGas', C, M, Data>
        | MetaMethodReturnType<'multicallStatic', C, M, Data>
        | MetaMethodReturnType<'populateTransaction', C, M, Data>
        | MetaMethodReturnType<'extractParams', C, M, Data>
        | MetaMethodReturnType<'send', C, M, Data> {
        if (params?.method === 'meta-method') return Promise.resolve(this);
        const mm = this.attachExtraData(params ?? {});
        switch (params?.method) {
            case 'callStatic':
                return mm.callStatic();
            case 'estimateGas':
                return mm.estimateGas();
            case 'multicallStatic':
                return mm.multicallStatic();
            case 'populateTransaction':
                return mm.populateTransaction();
            case 'extractParams':
                return mm.extractParams();
            case undefined:
            case 'send':
                return mm.send();
        }
    }

    static utils: {
        getContractSignerAddress: ContractMetaMethodUtilFunction<Promise<Address>>;
    } = {
        getContractSignerAddress: (contractMetaMethod) =>
            contractMetaMethod.contract.signer.getAddress().then(toAddress),
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
): MetaMethodReturnType<T, C, M, Data> {
    const metaMethod = new ContractMetaMethod<C, M, Data>(contract, methodName, callback, { ...data } as Data);
    return metaMethod.executeWithMethod(data);
}
