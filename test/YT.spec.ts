import { Contract } from 'ethers';
import { ERC20, PT, SCY, YT } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    TX_WAIT_TIME,
    WALLET,
} from './util/testUtils';

describe(YT, () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', async () => {
        expect(yt).toBeInstanceOf(YT);
        expect(yt.address).toBe(currentConfig.ytAddress);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(yt.contract).toBeInstanceOf(Contract);
        expect(yt.ERC20).toBeInstanceOf(ERC20);
    });

    it('#userInfo', async () => {
        const userInfo = await yt.userInfo(signer.address);
        expect(userInfo).toBeDefined();
        expect(userInfo.yt).toBe(yt.address);
        expect(userInfo.ytBalance.toBigInt()).toBeGreaterThanOrEqual(0);
        expect(userInfo.pt).toBe(currentConfig.ptAddress);
        expect(userInfo.ptBalance.toBigInt()).toBeGreaterThanOrEqual(0);
        expect(userInfo.unclaimedInterest.token).toBe(currentConfig.scyAddress);
        expect(userInfo.unclaimedInterest.amount.toBigInt()).toBeGreaterThanOrEqual(0);
        for (const { token, amount } of userInfo.unclaimedRewards) {
            expect(token).toBeDefined();
            expect(amount.toBigInt()).toBeGreaterThanOrEqual(0);
        }
    });

    it('#getInfo', async () => {
        const { exchangeRate, totalSupply, rewardIndexes } = await yt.getInfo();
        expect(exchangeRate.toBigInt()).toBeGreaterThanOrEqual(0);
        expect(totalSupply.toBigInt()).toBeGreaterThanOrEqual(0);
        for (const { rewardToken, index } of rewardIndexes) {
            expect(rewardToken).toBeDefined();
            expect(index.toBigInt()).toBeGreaterThanOrEqual(0);
        }
    });
});

// Only test rewards since other functions are tested through the router
describe('#contract', () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const qi = new ERC20(currentConfig.qiAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const { contract } = yt;

    it('Read contract', async () => {
        const [rewardToken, index] = await Promise.all([
            contract.callStatic.getRewardTokens(),
            contract.callStatic.scyIndexStored(),
        ]);
        expect(rewardToken.length).toBeGreaterThanOrEqual(0);
        expect(index.toBigInt()).toBeGreaterThanOrEqual(0);
    });

    describeWrite(() => {
        // TODO: Leave mint and redeem to the Router after it gets implemented in the contract
        it.skip('Mint PY', async () => {
            const [beforeYtBalance, beforePtBalance] = await Promise.all([
                yt.ERC20.balanceOf(signer.address),
                pt.ERC20.balanceOf(signer.address),
            ]);
            const transferScyTx = await scy.contract
                .connect(signer)
                .transfer(currentConfig.ytAddress, decimalFactor(20).mul(5));
            await transferScyTx.wait(1);
            const mintPYTx = await contract.connect(signer).mintPY(signer.address, signer.address);
            await mintPYTx.wait(1);
            const [afterYtBalance, afterPtBalance] = await Promise.all([
                yt.ERC20.balanceOf(signer.address),
                pt.ERC20.balanceOf(signer.address),
            ]);
            expect(afterPtBalance.toBigInt()).toBeGreaterThan(beforePtBalance.toBigInt());
            expect(afterYtBalance.toBigInt()).toBeGreaterThan(beforeYtBalance.toBigInt());
        });

        it.skip('Redeem PY', async () => {
            const scyBalanceBefore = await scy.contract.balanceOf(signer.address);
            const sendPtTx = await pt.contract.connect(signer).transfer(currentConfig.ytAddress, decimalFactor(18));
            await sendPtTx.wait(1);
            const sendYtTx = await yt.contract.connect(signer).transfer(currentConfig.ytAddress, decimalFactor(18));
            await sendYtTx.wait(1);
            const redeemPYTx = await contract.connect(signer).redeemPY(signer.address);
            await redeemPYTx.wait(1);
            const scyBalanceAfter = await scy.contract.balanceOf(signer.address);
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
        });

        it('Redeem interest and reward', async () => {
            const qiBalanceBefore = await qi.balanceOf(signer.address);
            const rewardTx = await contract.connect(signer).redeemDueInterestAndRewards(signer.address, true, true);
            await rewardTx.wait(TX_WAIT_TIME);
            const qiBalanceAfter = await qi.balanceOf(signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
