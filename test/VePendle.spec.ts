import { VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import { BigNumber } from 'ethers';
import { type Address, VePendle } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';
import { ERC20 } from '../src/entities/ERC20';
const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(VePendle, () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', () => {
        expect(ve).toBeInstanceOf(VePendle);
        expect(ve.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = ve.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });
});

describe('contract', () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const pendle = new ERC20(currentConfig.pendle, networkConnection, ACTIVE_CHAIN_ID);
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
        const approveTx = await pendle.approve(currentConfig.veAddress, BigNumber.from(10).pow(19));
        await approveTx.wait(1);
        const lockTx = await contract.connect(signer).increaseLockPosition(BigNumber.from(10).pow(19), newExpiry);
        await lockTx.wait(1);
        const pendleBalanceAfter = await pendle.balanceOf(signer.address);
        expect(pendleBalanceAfter.toBigInt()).toBeGreaterThan(pendleBalanceBefore.toBigInt());
    });

    // Cannot test withdraw
});
