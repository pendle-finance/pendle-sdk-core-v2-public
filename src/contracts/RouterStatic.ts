import { RouterStatic } from './typechainTypes';
import { RouterStaticABI } from './abis';
import { WrappedContract } from './types/WrappedContract';
import { createContractObject, ContractObjectConfig } from './createContractObject';
import { ChainId, getContractAddresses } from '../common';

// reexport
export { RouterStatic } from './typechainTypes';

export function getRouterStatic(chainId: ChainId, config: ContractObjectConfig): WrappedContract<RouterStatic> {
    return createContractObject<RouterStatic>(getContractAddresses(chainId).ROUTER_STATIC, RouterStaticABI, config);
}
