import { ERC20, VePendle, VePendleMainchain, isMainchain } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testUtils';
import './util/bigNumberMatcher';

describe(VePendle, () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);

    it('#constructor', () => {
        expect(ve).toBeInstanceOf(VePendle);
        expect(ve.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = ve.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });
});

describe('#contract', () => {
    // only test if ACTIVE_CHAIN_ID is mainchain
    if (!isMainchain(ACTIVE_CHAIN_ID)) {
        console.info(`Testing chain ${ACTIVE_CHAIN_ID} is not mainchain. No #contract methods have been tested.`);
        return;
    }
    const ve = new VePendleMainchain(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pendle = new ERC20(currentConfig.pendle, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const contract = ve.vePendleMainchainContract;

    it('read contract', async () => {
        const pendleAddress = await contract.pendle();
        expect(pendleAddress).toBe(currentConfig.pendle);
    });

    describeWrite(() => {
        it('#LockVE', async () => {
            const pendleBalanceBefore = await pendle.balanceOf(signer.address);
            const currentBlockNumber = await networkConnection.provider.getBlockNumber();
            const currentTimeStamp = (await networkConnection.provider.getBlock(currentBlockNumber)).timestamp;
            const week = await contract.WEEK();
            const newExpiry = Math.round((currentTimeStamp + 10 * week.toNumber()) / week.toNumber()) * week.toNumber();
            await pendle.approve(currentConfig.veAddress, decimalFactor(19)).then((tx) => tx.wait(BLOCK_CONFIRMATION));
            await contract
                .connect(signer)
                .increaseLockPosition(decimalFactor(19), newExpiry)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));
            const pendleBalanceAfter = await pendle.balanceOf(signer.address);
            expect(pendleBalanceAfter).toBeLtBN(pendleBalanceBefore);
        });

        // Can only test withdraw by advancing the time on a local fork
    });
});
