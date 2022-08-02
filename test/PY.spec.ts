import { Contract } from 'ethers';
import { PT, YT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe('PY', () => {
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#userInfo & #contract', async () => {
        const [userInfo, userPtBalance, userYtBalance, interestToken, interestAmount] = await Promise.all([
            pt.userInfo(currentConfig.deployer),
            pt.ERC20.balanceOf(currentConfig.deployer),
            yt.ERC20.balanceOf(currentConfig.deployer),
            yt.contract.callStatic.SCY(),
            yt.contract.callStatic.userInterest(currentConfig.deployer),
        ]);

        expect(userInfo.pt).toBe(currentConfig.ptAddress);
        expect(userInfo.ptBalance.eq(userPtBalance)).toBe(true);

        expect(userInfo.yt).toBe(currentConfig.ytAddress);
        expect(userInfo.ytBalance.eq(userYtBalance)).toBe(true);

        const interest = userInfo.unclaimedInterest;
        expect(interest.token).toBe(interestToken);
        expect(interest.amount.eq(interestAmount[1])).toBe(true);

        await Promise.all(
            userInfo.unclaimedRewards.map(async ({ token, amount }) => {
                const { accrued } = await yt.contract.callStatic.userReward(token, currentConfig.deployer);
                expect(amount).toBe(accrued);
            })
        );
    });

    it('#getInfo & #contract', async () => {
        const [ptInfo, ytInfo, ytTotalSupply, ytIndexCurrent, rewardToken] = await Promise.all([
            pt.getInfo(),
            yt.getInfo(),
            yt.ERC20.totalSupply(),
            yt.contract.callStatic.scyIndexCurrent(),
            yt.contract.callStatic.getRewardTokens(),
        ]);

        expect(ptInfo).toEqual(ytInfo);

        expect(ptInfo.totalSupply.eq(ytTotalSupply)).toBe(true);

        expect(ptInfo.exchangeRate.eq(ytIndexCurrent)).toBe(true);

        for (let i = 0; i < rewardToken.length; i++) {
            expect(ptInfo.rewardIndexes[i].index.gt(0)).toBe(true);
            expect(ptInfo.rewardIndexes[i].rewardToken).toBe(rewardToken[i]);
        }
    });
});
