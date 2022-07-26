import { PT, YT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(PT, () => {
    const pt = new PT(currentConfig.ptAddress, networkConnection, ACTIVE_CHAIN_ID);
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', async () => {
        expect(pt).toBeInstanceOf(PT);
        expect(pt.address).toBe(currentConfig.ptAddress);
        expect(pt.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract', async () => {
        const { contract } = pt;
        expect(contract).toBeDefined();
        const supply = await contract.totalSupply();
        expect(supply.toBigInt()).toBeGreaterThanOrEqual(0);
    });

    it('#userInfo', async () => {
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

    it('#getInfo', async () => {
        const [ptInfo, ytTotalSupply, ytIndexCurrent, rewardToken] = await Promise.all([
            pt.getInfo(),
            yt.ERC20.totalSupply(),
            yt.contract.callStatic.scyIndexCurrent(),
            yt.contract.callStatic.getRewardTokens(),
        ]);

        expect(ptInfo.totalSupply.eq(ytTotalSupply)).toBe(true);

        expect(ptInfo.exchangeRate.eq(ytIndexCurrent)).toBe(true);

        for (let i = 0; i < rewardToken.length; i++) {
            expect(ptInfo.rewardIndexes[i].index.toBigInt()).toBeGreaterThan(0);
            expect(ptInfo.rewardIndexes[i].rewardToken).toBe(rewardToken[i]);
        }
    });
});
