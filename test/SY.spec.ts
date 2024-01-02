import { SyEntity, Multicall, toAddresses, BN, isNativeToken, decimalFactor } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnectionWithChainId, BLOCK_CONFIRMATION } from './util/testEnv';
import {
    describeWithMulticall,
    setPendleERC20Balance,
    increaseNativeBalance,
    setERC20Balance,
    bnMinAsBn,
} from './util/testHelper';
import * as testHelper from './util/testHelper';
import * as tokenHelper from './util/tokenHelper';
import { DEFAULT_EPSILON, INF, MAX_TOKEN_ADD_AMOUNT, SLIPPAGE_TYPE2 } from './util/constants';

describe(SyEntity, () => {
    const { syAddress } = currentConfig.market;
    const sy = new SyEntity(syAddress, networkConnectionWithChainId);
    const signerAddress = networkConnectionWithChainId.signerAddress;
    let syDecimals: number;

    beforeAll(async () => {
        const balance = BN.from(10).pow(18).mul(1_000);
        await setPendleERC20Balance(syAddress, signerAddress, balance);
        await increaseNativeBalance(signerAddress);
        syDecimals = await tokenHelper.getERC20Decimals(syAddress);

        const tokensIn = await sy.getTokensIn();
        await Promise.all(
            tokensIn.map(async (token) => {
                return setERC20Balance(token, signerAddress, balance);
            })
        );
    });

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
            expect(userInfo.syBalance.amount).toBeGteBN(0);
            for (let i = 0; i < rewardTokens.length; i++) {
                const { token, amount } = userInfo.unclaimedRewards[i];
                expect(token).toBe(rewardTokens[i]);
                expect(amount).toEqBN(rewardAmounts[i]);
            }
        });
    });

    describe('write functions', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        it('#deposit & #previewDeposit', async () => {
            const tokensMintSy = (await sy.getTokensIn()).filter((token) => isNativeToken(token));
            for (const tokenMintSyAddr of tokensMintSy) {
                await tokenHelper.approve(tokenMintSyAddr, syAddress, INF);

                const syBalanceBefore = await tokenHelper.getBalance(syAddress, signerAddress);
                const amountIn = bnMinAsBn(
                    await tokenHelper.getBalance(tokenMintSyAddr, signerAddress),
                    MAX_TOKEN_ADD_AMOUNT
                );

                if (amountIn.eq(0)) {
                    console.warn(
                        `[${await tokenHelper.getERC20Name(tokenMintSyAddr)}] No balance to deposit to sy contract.`
                    );
                    continue;
                }

                const previewDeposit = await sy.previewDeposit(tokenMintSyAddr, amountIn);
                await sy.deposit(tokenMintSyAddr, amountIn, SLIPPAGE_TYPE2).then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const syBalanceAfter = await tokenHelper.getBalance(syAddress, signerAddress);
                expect(syBalanceAfter.sub(syBalanceBefore)).toEqBN(previewDeposit, DEFAULT_EPSILON);
            }
        });

        it('#redeem & #previewRedeem', async () => {
            const tokensRedeemSy = await sy.getTokensOut();
            for (const tokenRedeemSyAddr of tokensRedeemSy) {
                await tokenHelper.approve(syAddress, tokenRedeemSyAddr, INF);

                const syBalance = await tokenHelper.getBalance(syAddress, signerAddress);
                const syInAmount = bnMinAsBn(syBalance, decimalFactor(syDecimals).mul(MAX_TOKEN_ADD_AMOUNT)).div(100);
                if (syBalance.eq(0)) {
                    console.warn('No sy balance to redeem');
                    return;
                }
                const tokenBalanceBefore = await tokenHelper.getBalance(tokenRedeemSyAddr, signerAddress);

                const previewRedeem = await sy.previewRedeem(tokenRedeemSyAddr, syInAmount);
                await sy
                    .redeem(tokenRedeemSyAddr, syInAmount, SLIPPAGE_TYPE2)
                    .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                const tokenBalanceAfter = await tokenHelper.getBalance(tokenRedeemSyAddr, signerAddress);
                expect(tokenBalanceAfter.sub(tokenBalanceBefore)).toEqBN(previewRedeem, DEFAULT_EPSILON);
            }
        });
    });
});
