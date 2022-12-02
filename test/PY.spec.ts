import { PtEntity, YtEntity, Multicall, toAddress, toAddresses } from '../src';
import { DEFAULT_EPSILON } from './util/constants';
import { currentConfig, networkConnectionWithChainId } from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe('PY', () => {
    const currentMarket = currentConfig.market;
    const userAddress = currentConfig.userAddress;
    const pt = new PtEntity(currentMarket.PT, networkConnectionWithChainId);
    const yt = new YtEntity(currentMarket.YT, networkConnectionWithChainId);

    describeWithMulticall((multicall) => {
        it('#userInfo & #contract', async () => {
            const [userInfo, userPtBalance, userYtBalance, interestToken, simulateInterestAndRewards] =
                await Promise.all([
                    pt.userInfo(userAddress, { multicall }),
                    pt.balanceOf(userAddress, { multicall }),
                    yt.balanceOf(userAddress, { multicall }),
                    Multicall.wrap(yt.contract, multicall).callStatic.SY().then(toAddress),
                    Multicall.wrap(yt.contract, multicall).callStatic.redeemDueInterestAndRewards(
                        userAddress,
                        true,
                        true
                    ),
                ]);

            expect(userInfo.pt).toBe(currentMarket.PT);
            expect(userInfo.ptBalance).toEqBN(userPtBalance);

            expect(userInfo.yt).toBe(currentMarket.YT);
            expect(userInfo.ytBalance).toEqBN(userYtBalance);

            const interest = userInfo.unclaimedInterest;
            expect(interest.token).toBe(interestToken);
            expect(interest.amount).toEqBN(simulateInterestAndRewards.interestOut, DEFAULT_EPSILON);

            await Promise.all(
                userInfo.unclaimedRewards.map(async ({ token, amount }, i) => {
                    expect(amount).toEqBN(simulateInterestAndRewards.rewardsOut[i], DEFAULT_EPSILON);
                })
            );
        });

        it('#YT.userInfo & PT.userInfo', async () => {
            const [ytUserInfo, ptUserInfo] = await Promise.all([
                yt.userInfo(userAddress, { multicall }),
                pt.userInfo(userAddress, { multicall }),
            ]);

            expect(ytUserInfo).toEqual(ptUserInfo);
        });

        it('#getInfo & #contract', async () => {
            const [ptInfo, ytInfo, ytTotalSupply, ytIndexCurrent, rewardToken] = await Promise.all([
                pt.getInfo({ multicall }),
                yt.getInfo({ multicall }),
                yt.totalSupply({ multicall }),
                Multicall.wrap(yt.contract, multicall).callStatic.pyIndexCurrent(),
                Multicall.wrap(yt.contract, multicall).callStatic.getRewardTokens().then(toAddresses),
            ]);

            const eps = multicall ? 0 : 0.01; // if !multicall, requests might be in different block

            expect(ptInfo.exchangeRate).toEqBN(ytInfo.exchangeRate, eps);
            expect(ptInfo.exchangeRate).toEqBN(ytIndexCurrent);

            expect(ptInfo.totalSupply).toEqBN(ytInfo.totalSupply, eps);
            expect(ptInfo.totalSupply).toEqBN(ytTotalSupply);

            for (let i = 0; i < rewardToken.length; i++) {
                expect(ptInfo.rewardIndexes[i].index).toBeGtBN(0);
                expect(ptInfo.rewardIndexes[i].rewardToken).toBe(rewardToken[i]);

                expect(ptInfo.rewardIndexes[i].index).toEqBN(ytInfo.rewardIndexes[i].index, eps);
                expect(ptInfo.rewardIndexes[i].rewardToken).toEqBN(ytInfo.rewardIndexes[i].rewardToken);
            }
        });
    });
});
