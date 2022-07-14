import { JsonRpcProvider } from '@ethersproject/providers';
import { config } from 'dotenv';
import { inspect } from 'util';
import { type NetworkConnection, CHAIN_ID } from '../src';
import FUJI_CORE_ADDRESSES from '@pendle/core-v2/deployments/43113-core.json';
import FUJI_BENQI_ADDRESSES from '@pendle/core-v2/deployments/43113-markets/benqi-market.json';
import MUMBAI_CORE_ADDRESSES from '@pendle/core-v2/deployments/80001-core.json';
import MUMBAI_BENQI_ADDRESSES from '@pendle/core-v2/deployments/80001-markets/benqi-market.json';
import { ethers } from 'ethers';
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
            MARKET_FACTORY: FUJI_CORE_ADDRESSES.marketFactory,
            YT_FACTORY: FUJI_CORE_ADDRESSES.yieldContractFactory,
            ROUTER: FUJI_CORE_ADDRESSES.router,
            ROUTER_STATIC: FUJI_CORE_ADDRESSES.routerStatic,

        },
        BENQI: {
            SCY: FUJI_BENQI_ADDRESSES.SCY,
            MARKET: FUJI_BENQI_ADDRESSES.market,
            PT: FUJI_BENQI_ADDRESSES.PT,
            YT: FUJI_BENQI_ADDRESSES.YT
        },
    },
    [CHAIN_ID.MUMBAI]: {
        CORE: {
            DEPLOYER: MUMBAI_CORE_ADDRESSES.deployer,
            MARKET_FACTORY: MUMBAI_CORE_ADDRESSES.marketFactory,
            YT_FACTORY: MUMBAI_CORE_ADDRESSES.yieldContractFactory,
            ROUTER: MUMBAI_CORE_ADDRESSES.router,
            ROUTER_STATIC: MUMBAI_CORE_ADDRESSES.routerStatic,
        },
        BENQI: {
            SCY: MUMBAI_BENQI_ADDRESSES.SCY,
            MARKET: MUMBAI_BENQI_ADDRESSES.market,
            PT: MUMBAI_BENQI_ADDRESSES.PT,
            YT: MUMBAI_BENQI_ADDRESSES.YT
        },
    },
};

export const testConfig = (chainId: number) => ({
    scyAddress: CONTRACT_ADDRESSES[chainId].BENQI.SCY,
    deployer: CONTRACT_ADDRESSES[chainId].CORE.DEPLOYER,
    marketAddress: CONTRACT_ADDRESSES[chainId].BENQI.MARKET,
    ytAddress: CONTRACT_ADDRESSES[chainId].BENQI.YT,
    ptAddress: CONTRACT_ADDRESSES[chainId].BENQI.PT,
    marketFactory: CONTRACT_ADDRESSES[chainId].CORE.MARKET_FACTORY,
    router: CONTRACT_ADDRESSES[chainId].CORE.ROUTER,
    routerStatic: CONTRACT_ADDRESSES[chainId].CORE.ROUTER_STATIC,
    yieldContractFactory: CONTRACT_ADDRESSES[chainId].CORE.YT_FACTORY,
});

export const WALLET = () => (
    {
        wallet: new ethers.Wallet(process.env.PRIVATE_KEYS!).connect(networkConnection.provider),
    }
)

export function print(message: any): void {
    console.log(inspect(message, { showHidden: false, depth: null, colors: true }));
}
