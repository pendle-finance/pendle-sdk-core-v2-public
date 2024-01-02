import { IPRouterStatic } from './typechainTypes';
import { RouterStaticABI } from './abis';
import { WrappedContract } from './types/WrappedContract';
import { createContractObject, ContractObjectConfig } from './createContractObject';
import { ChainId, getContractAddresses } from '../common';

export { IPRouterStatic };

export type RouterStaticConfig = ContractObjectConfig & {
    chainId: ChainId;
};

/**
 * @deprecated RouterStatic is longer supported. Use PendleSDK's functionalities instead.
 */
export function getRouterStatic(config: RouterStaticConfig): WrappedContract<IPRouterStatic> {
    return createContractObject<IPRouterStatic>(
        getContractAddresses(config.chainId).ROUTER_STATIC,
        RouterStaticABI,
        config
    );
}
