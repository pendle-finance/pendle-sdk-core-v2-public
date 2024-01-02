import {
    CHAIN_ID_MAPPING,
    ERC20Entity,
    VePendle,
    VePendleMainchain,
    isMainchain,
    areSameAddresses,
    toAddress,
    zip,
} from '../src';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    networkConnection,
    networkConnectionWithChainId,
    BLOCK_CONFIRMATION,
} from './util/testEnv';
import { BigNumber as BN } from 'ethers';
import { DEFAULT_EPSILON, INF } from './util/constants';
import { TransactionReceipt } from '@ethersproject/abstract-provider';
import * as testHelper from './util/testHelper';

testHelper.describeIf(isMainchain(ACTIVE_CHAIN_ID))('VePendle', () => {
    const vePendle = new VePendleMainchain(currentConfig.veAddress, networkConnectionWithChainId);

    it('#constructor', () => {
        expect(vePendle).toBeInstanceOf(VePendle);
        expect(vePendle.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = vePendle.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });

    describe('write functions', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        const pendle = new ERC20Entity(currentConfig.pendle, networkConnection);
        const signerAddress = networkConnection.signerAddress;
        const contract = vePendle.contract;
        const sideChains = ACTIVE_CHAIN_ID == CHAIN_ID_MAPPING.ETHEREUM ? [] : [CHAIN_ID_MAPPING.MUMBAI];

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

        it('#broadcastUserPosition', async () => {
            if (sideChains.length == 0) return;
            const tx = await vePendle.broadcastUserPosition(sideChains).then((tx) => tx.wait(BLOCK_CONFIRMATION));
            verifyBroadcastTx(tx);
        });

        it('#broadcastUserPosition with custom overrides', async () => {
            if (sideChains.length == 0) return;
            const tx = await vePendle
                .broadcastUserPosition(sideChains, {
                    overrides: {
                        value: BN.from(10).pow(18),
                    },
                })
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));
            verifyBroadcastTx(tx);
        });

        function verifyBroadcastTx(tx: TransactionReceipt) {
            const filter = contract.filters.BroadcastUserPosition();
            const broadcastEvents = tx.logs.filter((log) =>
                areSameAddresses(toAddress(log.topics[0]), toAddress(filter.topics![0] as string))
            );

            expect(broadcastEvents.length).toEqual(1);

            const parsedEvent = contract.interface.parseLog(broadcastEvents[0]);

            const broadcastedChainIds: BN[] = parsedEvent.args[1];
            for (const [sideChainId, broadcastedChainId] of zip(sideChains, broadcastedChainIds)) {
                expect(sideChainId).toEqBN(broadcastedChainId);
            }
        }

        // Can only test withdraw by advancing the time on a local fork
    });
});
