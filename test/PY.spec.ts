import { PtEntity, YtEntity, Multicall, toAddress, zip } from '../src';
import { DEFAULT_EPSILON } from './util/constants';
import { currentConfig, networkConnectionWithChainId } from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe('PY', () => {
    const currentMarket = currentConfig.market;
    const userAddress = currentConfig.userAddress;
    const pt = new PtEntity(currentMarket.ptAddress, networkConnectionWithChainId);
    const yt = new YtEntity(currentMarket.ytAddress, networkConnectionWithChainId);

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

            expect(userInfo.ptBalance.token).toBe(currentMarket.ptAddress);
            expect(userInfo.ptBalance.amount).toEqBN(userPtBalance);

            expect(userInfo.ytBalance.token).toBe(currentMarket.ytAddress);
            expect(userInfo.ytBalance.amount).toEqBN(userYtBalance);

            const interest = userInfo.unclaimedInterest;
            expect(interest.token).toBe(interestToken);
            expect(interest.amount).toEqBN(simulateInterestAndRewards.interestOut, DEFAULT_EPSILON);

            for (const [unclaimedReward, simulatedClaimedReward] of zip(
                userInfo.unclaimedRewards,
                simulateInterestAndRewards.flat()
            )) {
                expect(unclaimedReward.amount).toEqBN(simulatedClaimedReward, DEFAULT_EPSILON);
            }
        });

        it('#YT.userInfo & PT.userInfo', async () => {
            const [ytUserInfo, ptUserInfo] = await Promise.all([
                yt.userInfo(userAddress, { multicall }),
                pt.userInfo(userAddress, { multicall }),
            ]);

            expect(ytUserInfo).toEqual(ptUserInfo);
        });
    });
});
