import { Address } from '../Address';

/**
 * Group of Pendle's contract addresses by name
 * @see CONTRACT_ADDRESSES
 */
export type ContractAddresses = {
    ROUTER: Address;
    ROUTER_STATIC: Address;
    PENDLE: Address;
    VEPENDLE: Address;
    WRAPPED_NATIVE: Address;
    VOTING_CONTROLLER?: Address;
    FEE_DISTRIBUTOR?: Address;
    FEE_DISTRIBUTORV2?: Address;
    PENDLE_SWAP: Address;
    ROUTER_HELPER: Address;
    ROUTER_HELPER_2?: Address;
    PENDLE_MULTICALL: Address | undefined;
    PENDLE_MULTICALLV2: Address | undefined;
};
