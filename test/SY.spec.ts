import { SyEntity, Multicall, toAddresses } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testEnv';
import { getBalance, approveHelper, describeWithMulticall, getERC20Name } from './util/testHelper';
import { DEFAULT_EPSILON, INF, SLIPPAGE_TYPE2 } from './util/constants';

describe(SyEntity, () => {
    const syAddress = currentConfig.market.SY;
    const sy = new SyEntity(syAddress, ACTIVE_CHAIN_ID, networkConnection);
    const signer = WALLET().wallet;
    const signerAddress = networkConnection.signerAddress;

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
                sy.userInfo(currentConfig.deployer, { multicall }),
                Multicall.wrap(sy.contract, multicall).callStatic.getRewardTokens().then(toAddresses),
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
        it('#deposit & #previewDeposit', async () => {
            const tokensMintSy = await sy.getTokensIn();
            for (const tokenMintSyAddr of tokensMintSy) {
                await approveHelper(tokenMintSyAddr, syAddress, INF);

                const syBalanceBefore = await getBalance(syAddress, signerAddress);
                const amountIn = await getBalance(tokenMintSyAddr, signerAddress);

                if (amountIn.eq(0)) {
                    console.warn(`[${await getERC20Name(tokenMintSyAddr)}] No balance to deposit to sy contract.`);
                    continue;
                }

                const previewDeposit = await sy.previewDeposit(tokenMintSyAddr, amountIn);
                await sy
                    .deposit(signerAddress, tokenMintSyAddr, amountIn, SLIPPAGE_TYPE2)
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const syBalanceAfter = await getBalance(syAddress, signerAddress);
                expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(previewDeposit, DEFAULT_EPSILON);
            }
        });

        it('#redeem & #previewRedeem', async () => {
            const tokensRedeemSy = await sy.getTokensOut();
            for (const tokenRedeemSyAddr of tokensRedeemSy) {
                await approveHelper(syAddress, tokenRedeemSyAddr, INF);

                const syBalance = await getBalance(syAddress, signerAddress);
                if (syBalance.eq(0)) {
                    console.warn('No sy balance to redeem');
                    return;
                }
                const tokenBalanceBefore = await getBalance(tokenRedeemSyAddr, signerAddress);

                const previewRedeem = await sy.previewRedeem(tokenRedeemSyAddr, syBalance);
                await sy
                    .redeem(signerAddress, tokenRedeemSyAddr, syBalance, SLIPPAGE_TYPE2, false)
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const tokenBalanceAfter = await getBalance(tokenRedeemSyAddr, signerAddress);
                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(previewRedeem, DEFAULT_EPSILON);
            }
        });
    });
});
