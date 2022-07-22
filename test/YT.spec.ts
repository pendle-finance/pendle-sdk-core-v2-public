import { Contract } from 'ethers';
import { ERC20, PT, SCY, YT } from '../src';
import { decimalFactor } from '../src/entities/helper';
import { getBalance, REDEEM_FACTOR, transferHelper } from './util/testHelper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    TX_WAIT_TIME,
    WALLET,
    print,
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
        it('Mint PY', async () => {
            const [beforeYtBalance, beforePtBalance] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);
            const mintAmount = (await getBalance('SCY', signer.address)).div(2);
            await transferHelper('SCY', currentConfig.ytAddress, mintAmount);
            const mintPYTx = await contract.connect(signer).mintPY(signer.address, signer.address);
            await mintPYTx.wait(TX_WAIT_TIME);
            const [afterYtBalance, afterPtBalance] = await Promise.all([
                getBalance('YT', signer.address),
                getBalance('PT', signer.address),
            ]);
            expect(afterPtBalance.toBigInt()).toBeGreaterThan(beforePtBalance.toBigInt());
            expect(afterYtBalance.toBigInt()).toBeGreaterThan(beforeYtBalance.toBigInt());
        });

        it('Redeem PY', async () => {
            const scyBalanceBefore = await getBalance('SCY', signer.address);
            const [amountPtRedeem, amountYtRedeem] = (
                await Promise.all([getBalance('PT', signer.address), getBalance('YT', signer.address)])
            ).map((amount) => amount.div(REDEEM_FACTOR));
            await transferHelper('PT', currentConfig.ytAddress, amountPtRedeem);
            await transferHelper('YT', currentConfig.ytAddress, amountYtRedeem);
            const redeemPYTx = await contract.connect(signer).redeemPY(signer.address);
            await redeemPYTx.wait(TX_WAIT_TIME);
            const scyBalanceAfter = await getBalance('SCY', signer.address);
            expect(scyBalanceAfter.toBigInt()).toBeGreaterThan(scyBalanceBefore.toBigInt());
        });

        it('Redeem interest and reward', async () => {
            const qiBalanceBefore = await getBalance('QI', signer.address);
            const rewardTx = await contract.connect(signer).redeemDueInterestAndRewards(signer.address, true, true);
            await rewardTx.wait(TX_WAIT_TIME);
            const qiBalanceAfter = await getBalance('QI', signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
