import { VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import { ERC20, VePendle } from '../src';
import { decimalFactor } from '../src/entities/helper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';

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
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pendle = new ERC20(currentConfig.pendle, networkConnection);
    const signer = WALLET().wallet;
    const contract: VotingEscrowPendleMainchain = ve.contract as VotingEscrowPendleMainchain;

    it('read contract', async () => {
        const pendleAddress = await contract.pendle();
        expect(pendleAddress).toBe(currentConfig.pendle);
    });

    it('#LockVE', async () => {
        const pendleBalanceBefore = await pendle.balanceOf(signer.address);
        const currentBlockNumber = await networkConnection.provider.getBlockNumber();
        const currentTimeStamp = (await networkConnection.provider.getBlock(currentBlockNumber)).timestamp;
        const week = await contract.WEEK();
        const newExpiry = Math.round((currentTimeStamp + 10 * week.toNumber()) / week.toNumber()) * week.toNumber();
        const approveTx = await pendle.approve(currentConfig.veAddress, decimalFactor(19));
        await approveTx.wait(1);
        const lockTx = await contract.connect(signer).increaseLockPosition(decimalFactor(19), newExpiry);
        await lockTx.wait(1);
        const pendleBalanceAfter = await pendle.balanceOf(signer.address);
        expect(pendleBalanceAfter.toBigInt()).toBeGreaterThan(pendleBalanceBefore.toBigInt());
    });

    // Can only test withdraw by advancing the time on a local fork
});
