import { BigNumber } from 'ethers';
import { type Address, SCY } from '../src';
import { ERC20 } from '../src/entities/ERC20';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, WALLET } from './util/testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID); // USD

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#deposit', async () => {
        const beforeBalance = await scy.contract.balanceOf(signer.address);
        const approveTx = await usdc.approve(currentConfig.scyAddress, BigNumber.from(10).pow(21));
        await approveTx.wait(1);
        const depositTx = await scy.deposit(
            signer.address,
            currentConfig.usdcAddress,
            BigNumber.from(10).pow(21),
            0,
            {}
        );
        await depositTx.wait(1);
        const afterBalance = await scy.contract.balanceOf(signer.address);
        expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
    });

    it('#redeem', async () => {
        const beforeBalance = await usdc.contract.balanceOf(signer.address);
        const redeemTx = await scy.redeem(signer.address, currentConfig.usdcAddress, BigNumber.from(10).pow(19), 0, {});
        await redeemTx.wait(1);
        const afterBalance = await usdc.contract.balanceOf(signer.address);
        expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
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
        }
    });
});

describe('#contract', () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    const qi = new ERC20(currentConfig.qiAddress, networkConnection, ACTIVE_CHAIN_ID);
    const { contract } = scy;

    it('Read contract', async () => {
        const baseToken = await contract.getBaseTokens();
        expect(baseToken[1]).toBe(currentConfig.usdcAddress);

        const rewardToken = await contract.getRewardTokens();
        expect(rewardToken[0]).toBe(currentConfig.qiAddress);
    });

    it('Claim reward', async () => {
        const qiBalanceBefore = await qi.balanceOf(signer.address);
        const claimReward = await contract.connect(signer).claimRewards(signer.address);
        await claimReward.wait(1);
        const qiBalanceAfter = await qi.balanceOf(signer.address);
        expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
    });
});
