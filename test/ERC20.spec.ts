import { ERC20 } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    TX_WAIT_TIME,
    WALLET,
} from './util/testUtils';

describe(ERC20, () => {
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(usdc).toBeInstanceOf(ERC20);
        expect(usdc.address).toBe(currentConfig.usdcAddress);
    });

    it('#contract', async () => {
        const [decimal, name, symbol, totalSupply] = await Promise.all([
            usdc.decimals(),
            usdc.name(),
            usdc.symbol(),
            usdc.totalSupply(),
        ]);
        expect(decimal).toBeGreaterThanOrEqual(6);
        expect(name).toBeDefined();
        expect(symbol).toBeDefined();
        expect(totalSupply.toBigInt()).toBeGreaterThanOrEqual(0);
    });

    describeWrite(() => {
        it('#allowance & #approve', async () => {
            const approveAmount = decimalFactor(17);
            const approveTx = await usdc.approve(currentConfig.marketAddress, approveAmount);
            await approveTx.wait(TX_WAIT_TIME);
            const currentAllowance = await usdc.allowance(signer.address, currentConfig.marketAddress);
            expect(currentAllowance.eq(approveAmount)).toBe(true);
            const resetTx = await usdc.approve(currentConfig.marketAddress, 0);
            await resetTx.wait(TX_WAIT_TIME);
        });

        it('#balanceOf & #transfer', async () => {
            const transferAmount = decimalFactor(17);
            const beforeBalance = await usdc.balanceOf(signer.address);
            const transferTx = await usdc.transfer(currentConfig.marketAddress, transferAmount);
            await transferTx.wait(TX_WAIT_TIME);
            const afterBalance = await usdc.balanceOf(signer.address);
            expect(beforeBalance.sub(afterBalance).eq(transferAmount)).toBe(true);
        });
    });
});
