import { ERC20, VePendle, VePendleMainchain, isMainchain, MainchainId } from '../src';
import { decimalFactor } from '../src/entities/math';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testUtils';
import './util/bigNumberMatcher';
import { BigNumber as BN } from 'ethers';

describe(VePendle, () => {
    const vePendle = new VePendleMainchain(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID as MainchainId);

    it('#constructor', () => {
        expect(vePendle).toBeInstanceOf(VePendle);
        expect(vePendle.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = vePendle.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });

    describeWrite(() => {
        const pendle = new ERC20(currentConfig.pendle, networkConnection, ACTIVE_CHAIN_ID);
        const signer = WALLET().wallet;
        const signerAddress = signer.address;
        const contract = vePendle.votingEscrowPendleMainchainContract;

        // only test if ACTIVE_CHAIN_ID is mainchain
        if (!isMainchain(ACTIVE_CHAIN_ID)) {
            console.warn(`Testing chain ${ACTIVE_CHAIN_ID} is not mainchain. No #contract methods have been tested.`);
            return;
        }

        it('#increaseLockPosition', async () => {
            const [pendleBalance, pendleDecimal] = await Promise.all([
                pendle.balanceOf(signerAddress, currentConfig.multicall),
                pendle.decimals(currentConfig.multicall),
            ]);

            if (pendleBalance.isZero()) {
                console.warn(`Skip #increaseLockPosition test, as signer (${signerAddress}) has zero pendle`);
                return;
            }

            const pendleBalanceBefore = await pendle.balanceOf(signer.address);
            const week = await vePendle.votingEscrowTokenBaseContract.WEEK();

            let currentExpiry = (await contract.positionData(signerAddress)).expiry;
            if (currentExpiry.isZero()) {
                currentExpiry = BN.from(Math.floor(Date.now() / 1000))
                    .add(week)
                    .sub(1)
                    .div(week)
                    .mul(week);
            }
            const newExpiry = currentExpiry.add(week);

            let lockAmount = decimalFactor(pendleDecimal - 2); // 0.01 pendle
            if (lockAmount.gt(pendleBalance)) {
                lockAmount = pendleBalance;
            }
            await pendle.approve(contract.address, lockAmount);

            await contract
                .connect(signer)
                .increaseLockPosition(lockAmount, newExpiry)
                .then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const pendleBalanceAfter = await pendle.balanceOf(signer.address);
            expect(pendleBalanceBefore.sub(pendleBalanceAfter)).toEqBN(lockAmount);
        });

        // Can only test withdraw by advancing the time on a local fork
    });
});
