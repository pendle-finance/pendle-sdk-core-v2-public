import { RouterStatic } from './typechainTypes';
import { RouterStaticABI } from './abis';
import { WrappedContract } from './types/WrappedContract';
import { createContractObject, ContractObjectConfig } from './createContractObject';
import { ChainId, getContractAddresses } from '../common';

// reexport
export { RouterStatic } from './typechainTypes';

export type RouterStaticConfig = ContractObjectConfig & {
    chainId: ChainId;
};

export function getRouterStatic(config: RouterStaticConfig): WrappedContract<RouterStatic> {
    return createContractObject<RouterStatic>(
        getContractAddresses(config.chainId).ROUTER_STATIC,
        RouterStaticABI,
        config
    );
}
