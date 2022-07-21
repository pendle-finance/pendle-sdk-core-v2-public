import { PT, YT } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, print } from './util/testUtils';

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
            await yt.ERC20.balanceOf(currentConfig.deployer),
            yt.contract.callStatic.SCY(),
            yt.contract.callStatic.userInterest(currentConfig.deployer),
        ]);

        expect(userInfo.pt).toBe(currentConfig.ptAddress);
        expect(userInfo.ptBalance.toBigInt()).toBe(userPtBalance.toBigInt());

        expect(userInfo.yt).toBe(currentConfig.ytAddress);
        expect(userInfo.ytBalance.toBigInt()).toBe(userYtBalance.toBigInt());

        const interest = userInfo.unclaimedInterest;
        expect(interest.token).toBe(interestToken);
        expect(interest.amount.toBigInt()).toBe(interestAmount[1].toBigInt());

        const reward = userInfo.unclaimedRewards;

        const amountExpected = await Promise.all(
            reward.map(
                async (token) => (await yt.contract.callStatic.userReward(token.token, currentConfig.deployer))[1]
            )
        );
        const amountActual = reward.map((token) => token.amount);
        expect(amountActual).toEqual(amountExpected);
    });

    it('#getInfo', async () => {
        const [ptInfo, ytTotalSupply, ytIndexCurrent, rewardToken] = await Promise.all([
            pt.getInfo(),
            yt.contract.callStatic.totalSupply(),
            yt.contract.callStatic.scyIndexCurrent(),
            yt.contract.callStatic.getRewardTokens(),
        ]);

        expect(ptInfo.totalSupply.toBigInt()).toBe(ytTotalSupply.toBigInt());

        expect(ptInfo.exchangeRate.toBigInt()).toBe(ytIndexCurrent.toBigInt());

        for (let i = 0; i < rewardToken.length; i++) {
            expect(ptInfo.rewardIndexes[i].index.toBigInt()).toBeGreaterThan(0);
            expect(ptInfo.rewardIndexes[i].rewardToken).toBe(rewardToken[i]);
        }
    });
});
