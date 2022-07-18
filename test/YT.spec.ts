import { yellow } from '@material-ui/core/colors';
import { BigNumber } from 'ethers';
import { type Address, YT, SCY } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, WALLET, print } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(YT, () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', async () => {
        expect(yt).toBeInstanceOf(YT);
        expect(yt.address).toBe(currentConfig.ytAddress);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#userInfo', async () => {
        const userInfo = await yt.getInfo();
        expect(userInfo).toBeDefined();
    });
    it('#getInfo', async () => {
        const info = await yt.getInfo();
        expect(info).toBeDefined();
    });
});

// Only test reward since other function test through router
describe('contract', () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const { contract } = yt;
    it('Read contract', async () => {
        const rewardToken = await contract.getRewardTokens();
        expect(rewardToken).toBeDefined();

        const index = await contract.scyIndexStored();
        expect(index).toBeDefined();
    });

    it('Redeem interest', async () => {
        const interest = await contract.connect(signer).redeemDueInterest(signer.address);
        // Check Scy balance by hand
    });

    it('Redeem reward', async () => {
        const reward = await contract.connect(signer).redeemDueRewards(signer.address);
        // Check balance by hand
    });

    it('Redeem interest and reward', async () => {
        const reward = await contract.connect(signer).redeemDueInterestAndRewards(signer.address);
        // Check balance by hand
    });
});
