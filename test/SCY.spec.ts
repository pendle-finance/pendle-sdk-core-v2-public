import { BigNumber } from 'ethers';
import { type Address, SCY } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    //  it will fail if not add approve ( need seperate approve )
    it('#contract', async () => {
        const { contract } = scy;
        expect(contract).toBeDefined();
        expect(contract.getBaseTokens()).resolves.toHaveLength;
        //  await contract.connect(signer).deposit(signer.address,"0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D",BigNumber.from(10).pow(21),0);
        //  await contract.connect(signer).redeem(signer.address,BigNumber.from(10).pow(20),"0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D",0);
    });

    it('#userInfo', async () => {
        const [userInfo, rewardTokens] = await Promise.all([
            scy.userInfo(currentConfig.deployer),
            scy.contract.getRewardTokens(),
        ]);
        expect(userInfo.balance.isZero()).toBe(true);
        for (let i = 0; i < rewardTokens.length; i++) {
            const { token, amount } = userInfo.rewards[i];
            expect(token).toBe(rewardTokens[i]);
            print(amount);
        }
    });
});
