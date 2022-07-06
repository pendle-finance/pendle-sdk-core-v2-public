import { JsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { inspect } from 'util';
import { type NetworkConnection, CHAIN_ID } from '../src';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import FUJI_BENQI_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';
import MUMBAI_BENQI_ADDRESSES from '@pendle/core-v2/deployments/80001-markets/benqi-market.json';

config();

// Change this to the current active network
export const ACTIVE_CHAIN_ID = Number(process.env.ACTIVE_CHAIN_ID);
const LOCAL_CHAIN_ID = 31337;
const USE_LOCAL = !!process.env.USE_LOCAL;

const providerUrls = {
    [CHAIN_ID.ETHEREUM]: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    [CHAIN_ID.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
    [CHAIN_ID.FUJI]: 'https://api.avax-test.network/ext/bc/C/rpc',
    [CHAIN_ID.MUMBAI]: 'https://matic-mumbai.chainstacklabs.com',
    [LOCAL_CHAIN_ID]: 'http://localhost:8545',
};

export const networkConnection: NetworkConnection = {
    provider: new JsonRpcProvider(USE_LOCAL ? providerUrls[LOCAL_CHAIN_ID] : providerUrls[ACTIVE_CHAIN_ID]),
    get signer() {
        return this.provider.getSigner();
    },
};

export const CONTRACT_ADDRESSES = {
    [CHAIN_ID.FUJI]: {
        CORE: {
            DEPLOYER: FUJI_CORE_ADDRESSES.deployer,
        },
        BENQI: {
            SCY: FUJI_BENQI_ADDRESSES.SCY,
        },
    },
    [CHAIN_ID.MUMBAI]: {
        CORE: {
            DEPLOYER: MUMBAI_CORE_ADDRESSES.deployer,
        },
        BENQI: {
            SCY: MUMBAI_BENQI_ADDRESSES.SCY,
        },
    },
};

export function print(message: any): void {
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}
