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
    VOTING_CONTROLLER?: Address;
    FEE_DISTRIBUTOR?: Address;
};