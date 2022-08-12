import { Contract } from 'ethers';
import { ERC20, SCY } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testUtils';
import { getBalance, approveHelper, REDEEM_FACTOR, SLIPPAGE_TYPE2, DEFAULT_MINT_AMOUNT } from './util/testHelper';
import './util/BigNumberMatcher';

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(scy.contract).toBeInstanceOf(Contract);
        expect(scy.ERC20).toBeInstanceOf(ERC20);
        expect(scy.contract.address).toBe(currentConfig.scyAddress);
    });

    it('#userInfo & #contract', async () => {
        const [userInfo, rewardTokens, rewardAmounts] = await Promise.all([
            scy.userInfo(currentConfig.deployer),
            scy.contract.callStatic.getRewardTokens(),
            scy.contract.callStatic.accruedRewards(currentConfig.deployer),
        ]);
        expect(userInfo.balance).toBeGteBN(0);
        for (let i = 0; i < rewardTokens.length; i++) {
            const { token, amount } = userInfo.rewards[i];
            expect(token).toBe(rewardTokens[i]);
            expect(amount).toEqBN(rewardAmounts[i]);
        }
    });

    describeWrite(() => {
        it('#deposit', async () => {
            const scyBalanceBefore = await getBalance('SCY', signer.address);
            const amount = DEFAULT_MINT_AMOUNT;

            await approveHelper('USDC', currentConfig.scyAddress, amount);
            const depositTx = await scy.deposit(signer.address, currentConfig.usdcAddress, amount, SLIPPAGE_TYPE2);
            await depositTx.wait(BLOCK_CONFIRMATION);
            await approveHelper('USDC', currentConfig.scyAddress, 0);

            const scyBalanceAfter = await getBalance('SCY', signer.address);
            expect(scyBalanceAfter).toBeGtBN(scyBalanceBefore);
        });

        it('#redeem', async () => {
            const redeemAmount = (await getBalance('SCY', signer.address)).div(REDEEM_FACTOR);
            const usdcBalanceBefore = await getBalance('USDC', signer.address);

            const redeemTx = await scy.redeem(signer.address, currentConfig.usdcAddress, redeemAmount, SLIPPAGE_TYPE2);
            await redeemTx.wait(BLOCK_CONFIRMATION);

            const usdcBalanceAfter = await getBalance('USDC', signer.address);
            expect(usdcBalanceAfter).toBeGtBN(usdcBalanceBefore);
        });
    });
});
