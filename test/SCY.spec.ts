import { type Address, CHAIN_ID, SCY } from '../src';
import { ACTIVE_CHAIN_ID, CONTRACT_ADDRESSES, networkConnection } from './testUtils';
// import { print } from './testUtils';

const testConfig = {
    [CHAIN_ID.KOVAN]: {
        scyAddress: CONTRACT_ADDRESSES.KOVAN.YIELD_CONTRACTS['SCY-QIUSD-25-DEC'].SCY.address,
        deployer: CONTRACT_ADDRESSES.KOVAN.DEPLOYER,
        // faucet: CONTRACT_ADDRESSES.KOVAN.MOCK_CONTRACTS.FAUCET,
    },
};
const currentConfig = testConfig[ACTIVE_CHAIN_ID];

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
