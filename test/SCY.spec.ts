import { BigNumber } from 'ethers';
import { type Address, SCY } from '../src';
import { ERC20 } from '../src/entities/ERC20';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe.skip(SCY, () => {
    const usdAddress = '0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D';
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const erc20 = new ERC20(usdAddress, networkConnection, ACTIVE_CHAIN_ID); // USD

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
    });
    // Why it does not wait until the tx confirm
    it('#deposit', async () => {
        const beforeBalance = await scy.contract.balanceOf(signer.address);
        await erc20.approve(currentConfig.scyAddress, BigNumber.from(10).pow(20));
        await scy.deposit(signer.address, usdAddress, BigNumber.from(10).pow(20), 0, {});
        const afterBalance = await scy.contract.balanceOf(signer.address);
    });

    // Why it does not wait until the tx confirm
    it('#redeem', async () => {
        const beforeBalance = await erc20.contract.balanceOf(signer.address);
        await scy.redeem(signer.address, usdAddress, BigNumber.from(10).pow(20), 0, {});
        const afterBalance = await erc20.contract.balanceOf(signer.address);
        expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
    });
    it('#userInfo', async () => {
        const [userInfo, rewardTokens] = await Promise.all([
            scy.userInfo(currentConfig.deployer),
            scy.contract.getRewardTokens(),
        ]);
        expect(userInfo.balance.isZero()).toBe(false);
        for (let i = 0; i < rewardTokens.length; i++) {
            const { token, amount } = userInfo.rewards[i];
            expect(token).toBe(rewardTokens[i]);
        }
    });
});

describe('#contract', () => {
    const usdAddress = '0x2018ecc38fbca2ce3A62f96f9F0D38F0DEE2f99D';
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const erc20 = new ERC20(usdAddress, networkConnection, ACTIVE_CHAIN_ID); // USD
    const { contract } = scy;

    it('Read contract', async () => {
        const baseToken = await contract.getBaseTokens();
        expect(baseToken[1]).toBe(usdAddress);

        const rewardToken = await contract.getRewardTokens();
        expect(rewardToken).toBeDefined();
    });

    it('Claim reward', async () => {
        const amount = await contract.connect(signer).claimRewards(signer.address);
        // check Qi balance by hand
    });
});
