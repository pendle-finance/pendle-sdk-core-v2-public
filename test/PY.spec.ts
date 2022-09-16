import { PtEntity, YtEntity, Multicall } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, describeWithMulticall } from './util/testUtils';
import './util/bigNumberMatcher';

describe('PY', () => {
    const currentMarket = currentConfig.market;
    const pt = new PtEntity(currentMarket.PT, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new YtEntity(currentMarket.YT, networkConnection, ACTIVE_CHAIN_ID);

    describeWithMulticall((multicall) => {
        it('#userInfo & #contract', async () => {
            const [userInfo, userPtBalance, userYtBalance, interestToken, interestAmount] = await Promise.all([
                pt.userInfo(currentConfig.deployer, multicall),
                pt.ERC20.balanceOf(currentConfig.deployer, multicall),
                yt.ERC20.balanceOf(currentConfig.deployer, multicall),
                Multicall.wrap(yt.contract, multicall).callStatic.SCY(),
                Multicall.wrap(yt.contract, multicall).callStatic.userInterest(currentConfig.deployer),
            ]);

            expect(userInfo.pt).toBe(currentMarket.PT);
            expect(userInfo.ptBalance).toEqBN(userPtBalance);

            expect(userInfo.yt).toBe(currentMarket.YT);
            expect(userInfo.ytBalance).toEqBN(userYtBalance);

            const interest = userInfo.unclaimedInterest;
            expect(interest.token).toBe(interestToken);
            expect(interest.amount).toEqBN(interestAmount[1]);

            await Promise.all(
                userInfo.unclaimedRewards.map(async ({ token, amount }) => {
                    const { accrued } = await Multicall.wrap(yt.contract, multicall).callStatic.userReward(
                        token,
                        currentConfig.deployer
                    );
                    expect(amount).toEqBN(accrued);
                })
            );
        });

        it('#YT.userInfo & PT.userInfo', async () => {
            const [ytUserInfo, ptUserInfo] = await Promise.all([
                yt.userInfo(currentConfig.deployer, multicall),
                pt.userInfo(currentConfig.deployer, multicall),
            ]);

            expect(ytUserInfo).toEqual(ptUserInfo);
        });

        it('#getInfo & #contract', async () => {
            const [ptInfo, ytInfo, ytTotalSupply, ytIndexCurrent, rewardToken] = await Promise.all([
                pt.getInfo(multicall),
                yt.getInfo(multicall),
                yt.ERC20.totalSupply(multicall),
                Multicall.wrap(yt.contract, multicall).callStatic.pyIndexCurrent(),
                Multicall.wrap(yt.contract, multicall).callStatic.getRewardTokens(),
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
