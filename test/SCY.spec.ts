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
import { getBalance, approveHelper, REDEEM_FACTOR, SLIPPAGE_TYPE2 } from './util/testHelper';
describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

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
            const beforeBalance = await getBalance('SCY', signer.address);
            const amount = decimalFactor(21);
            await approveHelper('USDC', currentConfig.scyAddress, amount);
            const depositTx = await scy.deposit(signer.address, currentConfig.usdcAddress, amount, SLIPPAGE_TYPE2);
            await depositTx.wait(TX_WAIT_TIME);
            const afterBalance = await getBalance('SCY', signer.address);
            expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
        });

        it('#redeem', async () => {
            const redeemAmount = (await getBalance('SCY', signer.address)).div(REDEEM_FACTOR);
            const beforeBalance = await getBalance('USDC', signer.address);
            const redeemTx = await scy.redeem(signer.address, currentConfig.usdcAddress, redeemAmount, SLIPPAGE_TYPE2);
            await redeemTx.wait(TX_WAIT_TIME);
            const afterBalance = await getBalance('USDC', signer.address);
            expect(afterBalance.toBigInt()).toBeGreaterThan(beforeBalance.toBigInt());
        });
    });
});

describe('#contract', () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const { contract } = scy;

    it('Read contract', async () => {
        const rewardToken = await contract.callStatic.getRewardTokens();
        expect(rewardToken.length).toBeGreaterThanOrEqual(0);
    });

    describeWrite(() => {
        it('Claim reward', async () => {
            const qiBalanceBefore = await getBalance('QI', signer.address);
            const claimReward = await contract.connect(signer).claimRewards(signer.address);
            await claimReward.wait(TX_WAIT_TIME);
            const qiBalanceAfter = await getBalance('QI', signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
