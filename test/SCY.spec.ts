import { type Address, SCY } from '../src';
import { ACTIVE_CHAIN_ID, CONTRACT_ADDRESSES, networkConnection } from './testUtils';
// import { print } from './testUtils';

const testConfig = (chainId: number) => ({
    scyAddress: CONTRACT_ADDRESSES[chainId].BENQI.SCY,
    deployer: CONTRACT_ADDRESSES[chainId].CORE.DEPLOYER,
});
const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(SCY, () => {
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    let signerAddress: Address;

    it('#constructor', () => {
        expect(scy).toBeInstanceOf(SCY);
        expect(scy.address).toBe(currentConfig.scyAddress);
        expect(scy.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#contract', async () => {
        const { contract } = scy;
        expect(contract).toBeDefined();
        expect(contract.getBaseTokens()).resolves.toHaveLength;
        // print(await contract.getBaseTokens());
    });

    it('#userInfo', async () => {
        const [userInfo, rewardTokens] = await Promise.all([
            scy.userInfo(currentConfig.deployer),
            scy.contract.getRewardTokens(),
        ]);
        expect(userInfo.balance.isZero()).toBe(true);
        for (let i = 0; i < rewardTokens.length; i++) {
            const { token, amount } = userInfo.rewards[i];
            expect(token).toBe(rewardTokens[i]);
            expect(amount.isZero()).toBe(true);
        }
    });
});
