import { Contract } from 'ethers';
import { ERC20, SCY } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    TX_WAIT_TIME,
    WALLET,
} from './util/testUtils';

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID); // USD

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(scy.contract).toBeInstanceOf(Contract);
        expect(scy.ERC20).toBeInstanceOf(ERC20);
    });

    it('#userInfo', async () => {
        const [userInfo, rewardTokens] = await Promise.all([
            scy.userInfo(currentConfig.deployer),
            scy.contract.callStatic.getRewardTokens(),
        ]);
        expect(userInfo.balance.toBigInt()).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < rewardTokens.length; i++) {
            const { token, amount } = userInfo.rewards[i];
            expect(token).toBe(rewardTokens[i]);
            expect(amount.toBigInt()).toBeGreaterThanOrEqual(0);
        }
    });

    describeWrite(() => {
        it('#deposit', async () => {
            const scyToken = scy.ERC20;
            const beforeBalance = await scyToken.balanceOf(signer.address);
            const amount = decimalFactor(21);
            const approveTx = await usdc.approve(currentConfig.scyAddress, amount);
            await approveTx.wait(TX_WAIT_TIME);
            const depositTx = await scy.deposit(signer.address, currentConfig.usdcAddress, amount, 0);
            await depositTx.wait(TX_WAIT_TIME);
            const afterBalance = await scyToken.balanceOf(signer.address);
            expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
        });

        it('#redeem', async () => {
            const beforeBalance = await usdc.balanceOf(signer.address);
            const redeemTx = await scy.redeem(signer.address, currentConfig.usdcAddress, decimalFactor(19), 0);
            await redeemTx.wait(TX_WAIT_TIME);
            const afterBalance = await usdc.balanceOf(signer.address);
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
        const baseToken = await contract.callStatic.getBaseTokens();
        expect(baseToken[1]).toBe(currentConfig.usdcAddress);

        const rewardToken = await contract.callStatic.getRewardTokens();
        expect(rewardToken[0]).toBe(currentConfig.qiAddress);
    });

    describeWrite(() => {
        it('Claim reward', async () => {
            const qiBalanceBefore = await qi.balanceOf(signer.address);
            const claimReward = await contract.connect(signer).claimRewards(signer.address);
            await claimReward.wait(TX_WAIT_TIME);
            const qiBalanceAfter = await qi.balanceOf(signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
