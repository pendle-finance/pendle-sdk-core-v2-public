import { JsonRpcProvider } from '@ethersproject/providers';
import KOVAN_CONTRACTS from '@pendle/core-v2/deployments/kovan.json';
import { config } from 'dotenv';
import { inspect } from 'util';
import { type NetworkConnection, CHAIN_ID } from '../src';

config();

// Change this to the current active network
export const ACTIVE_CHAIN_ID = CHAIN_ID.KOVAN;
const LOCAL_CHAIN_ID = 31337;
const USE_LOCAL = !!process.env.USE_LOCAL;

const providerUrls = {
    [CHAIN_ID.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID.KOVAN]: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [LOCAL_CHAIN_ID]: 'http://localhost:8545',
};

export const networkConnection: NetworkConnection = {
    provider: new JsonRpcProvider(USE_LOCAL ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]),
    get signer() {
        return this.provider.getSigner();
    },
};

export const CONTRACT_ADDRESSES = {
    KOVAN: KOVAN_CONTRACTS,
};

export function print(message: any): void {
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}
