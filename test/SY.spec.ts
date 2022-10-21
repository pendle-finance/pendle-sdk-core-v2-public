import { SyEntity, Multicall } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
    describeWithMulticall,
} from './util/testUtils';
import { getBalance, approveHelper, REDEEM_FACTOR, SLIPPAGE_TYPE2, DEFAULT_MINT_AMOUNT } from './util/testHelper';
import './util/bigNumberMatcher';

describe(SyEntity, () => {
    const syAddress = currentConfig.market.SY;
    const sy = new SyEntity(syAddress, ACTIVE_CHAIN_ID, networkConnection);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(sy).toBeInstanceOf(SyEntity);
        expect(sy.address).toBe(syAddress);
        expect(sy.chainId).toBe(ACTIVE_CHAIN_ID);
        // expect(sy.contract).toBeInstanceOf(Contract);
        // expect(sy.syContract).toBeInstanceOf(Contract);
        expect(sy.contract.address).toBe(syAddress);
    });

    describeWithMulticall((multicall) => {
        it('#userInfo & #contract', async () => {
            const [userInfo, rewardTokens, rewardAmounts] = await Promise.all([
                sy.userInfo(currentConfig.deployer, multicall),
                Multicall.wrap(sy.contract, multicall).callStatic.getRewardTokens(),
                Multicall.wrap(sy.contract, multicall).callStatic.accruedRewards(currentConfig.deployer),
            ]);
            expect(userInfo.balance).toBeGteBN(0);
            for (let i = 0; i < rewardTokens.length; i++) {
                const { token, amount } = userInfo.rewards[i];
                expect(token).toBe(rewardTokens[i]);
                expect(amount).toEqBN(rewardAmounts[i]);
            }
        });
    });

    describeWrite(() => {
        const tokenIn = currentConfig.market.token;

        it('#deposit', async () => {
            const syBalanceBefore = await getBalance(syAddress, signer.address);
            const amount = DEFAULT_MINT_AMOUNT;
            await approveHelper(tokenIn, syAddress, amount);
            await sy.deposit(signer.address, tokenIn, amount, SLIPPAGE_TYPE2).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const syBalanceAfter = await getBalance(syAddress, signer.address);
            expect(syBalanceAfter).toBeGtBN(syBalanceBefore);
        });

        it('#redeem', async () => {
            const redeemAmount = (await getBalance(syAddress, signer.address)).div(REDEEM_FACTOR);
            const usdBalanceBefore = await getBalance(tokenIn, signer.address);

            await sy
                .redeem(signer.address, tokenIn, redeemAmount, SLIPPAGE_TYPE2, false)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const usdBalanceAfter = await getBalance(tokenIn, signer.address);
            expect(usdBalanceAfter).toBeGtBN(usdBalanceBefore);
        });
    });
});
