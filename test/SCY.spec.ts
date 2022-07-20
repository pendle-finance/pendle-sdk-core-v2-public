import { ERC20, SCY } from '../src';
import { decimalFactor } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID); // USD

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
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
            expect(amount.toBigInt()).toBeGreaterThanOrEqual(0);
        }
    });

    describe.skip('write functions', () => {
        it('#deposit', async () => {
            const beforeBalance = await scy.contract.balanceOf(signer.address);
            const approveTx = await usdc.approve(currentConfig.scyAddress, decimalFactor(21));
            await approveTx.wait(1);
            const depositTx = await scy.deposit(signer.address, currentConfig.usdcAddress, decimalFactor(21), 0);
            await depositTx.wait(1);
            const afterBalance = await scy.contract.balanceOf(signer.address);
            expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
        });

        it('#redeem', async () => {
            const beforeBalance = await usdc.contract.balanceOf(signer.address);
            const redeemTx = await scy.redeem(signer.address, currentConfig.usdcAddress, decimalFactor(19), 0);
            await redeemTx.wait(1);
            const afterBalance = await usdc.contract.balanceOf(signer.address);
            expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
        });
    });
});

describe('#contract', () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const qi = new ERC20(currentConfig.qiAddress, networkConnection, ACTIVE_CHAIN_ID);
    const { contract } = scy;

    it('Read contract', async () => {
        const baseToken = await contract.getBaseTokens();
        expect(baseToken[1]).toBe(currentConfig.usdcAddress);

        const rewardToken = await contract.getRewardTokens();
        expect(rewardToken[0]).toBe(currentConfig.qiAddress);
    });

    describe.skip('write functions', () => {
        it('Claim reward', async () => {
            const qiBalanceBefore = await qi.balanceOf(signer.address);
            const claimReward = await contract.connect(signer).claimRewards(signer.address);
            await claimReward.wait(1);
            const qiBalanceAfter = await qi.balanceOf(signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
