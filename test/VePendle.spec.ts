import { ERC20Entity, VePendle, VePendleMainchain, isMainchain } from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    networkConnectionWithChainId,
    BLOCK_CONFIRMATION,
    describeIf,
} from './util/testEnv';
import { BigNumber as BN } from 'ethers';
import { DEFAULT_EPSILON, INF } from './util/constants';

describeIf(isMainchain(ACTIVE_CHAIN_ID), 'VePendle', () => {
    const vePendle = new VePendleMainchain(currentConfig.veAddress, networkConnectionWithChainId);

    it('#constructor', () => {
        expect(vePendle).toBeInstanceOf(VePendle);
        expect(vePendle.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = vePendle.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });

    describeWrite(() => {
        const pendle = new ERC20Entity(currentConfig.pendle, networkConnection);
        const signerAddress = networkConnection.signerAddress;
        const contract = vePendle.contract;

        it('#increaseLockPosition', async () => {
            const pendleBalanceBefore = await pendle.balanceOf(signerAddress);
            if (pendleBalanceBefore.isZero()) {
                console.warn(`No PENDLE balance in ${signerAddress}.`);
                return;
            }
            // lock all PENDLE
            const lockAmount = pendleBalanceBefore;

            const week = await vePendle.contract.WEEK();
            const positionDataBefore = await vePendle.positionData(signerAddress);

            let currentExpiry = positionDataBefore.expiry;
            if (currentExpiry.isZero()) {
                currentExpiry = BN.from(Math.floor(Date.now() / 1000))
                    .add(week)
                    .sub(1)
                    .div(week)
                    .mul(week);
            }
            const newExpiry = currentExpiry.add(week);

            const simulatedVePendleAmount = await vePendle.simulateIncreaseLockPosition(
                signerAddress,
                lockAmount,
                newExpiry
            );

            await pendle.approve(contract.address, INF).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            await vePendle
                .increaseLockPosition(pendleBalanceBefore, newExpiry)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const pendleBalanceAfter = await pendle.balanceOf(signerAddress);
            expect(pendleBalanceBefore.sub(pendleBalanceAfter)).toEqBN(lockAmount);

            const positionDataAfter = await vePendle.positionData(signerAddress);
            expect(positionDataAfter.amount).toEqBN(positionDataBefore.amount.add(lockAmount));
            expect(positionDataAfter.expiry).toEqBN(newExpiry);

            expect(simulatedVePendleAmount).toEqBN(await vePendle.balanceOf(signerAddress), DEFAULT_EPSILON);
        });

        // Can only test withdraw by advancing the time on a local fork
    });
});
