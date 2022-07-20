import { ERC20, PT, SCY, YT } from '../src';
import { decimalFactor } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';

describe(YT, () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);

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

// Only test rewards since other functions are tested through the router
describe('#contract', () => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const qi = new ERC20(currentConfig.qiAddress, networkConnection);
    const signer = WALLET().wallet;
    const { contract } = yt;

    it('Read contract', async () => {
        const rewardToken = await contract.getRewardTokens();
        expect(rewardToken).toBeDefined();
        const index = await contract.scyIndexStored();
        expect(index).toBeDefined();
    });

    describe('write functions', () => {
        it('Mint PY', async () => {
            const beforeYtBalance = await yt.contract.balanceOf(signer.address);
            const beforePtBalance = await pt.contract.balanceOf(signer.address);
            const transferScyTx = await scy.contract
                .connect(signer)
                .transfer(currentConfig.ytAddress, decimalFactor(20).mul(5));
            await transferScyTx.wait(1);
            const mintPYTx = await contract.connect(signer).mintPY(signer.address, signer.address);
            await mintPYTx.wait(1);
            const afterYtBalance = await yt.contract.balanceOf(signer.address);
            const afterPtBalance = await pt.contract.balanceOf(signer.address);
            expect(afterPtBalance.toBigInt()).toBeGreaterThan(beforePtBalance.toBigInt());
            expect(afterYtBalance.toBigInt()).toBeGreaterThan(beforeYtBalance.toBigInt());
        });

        it('Redeem PY', async () => {
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
            await rewardTx.wait(1);
            const qiBalanceAfter = await qi.balanceOf(signer.address);
            expect(qiBalanceAfter.toBigInt()).toBeGreaterThan(qiBalanceBefore.toBigInt());
        });
    });
});
