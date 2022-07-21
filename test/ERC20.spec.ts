import { ERC20 } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET, TX_WAIT_TIME } from './util/testUtils';
import { decimalFactor } from '../src/entities/helper';
describe(ERC20, () => {
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', () => {
        expect(usdc).toBeInstanceOf(ERC20);
        expect(usdc.address).toBe(currentConfig.usdcAddress);
    });

    it('#allowance & appove', async () => {
        const approveTx = await usdc.approve(currentConfig.marketAddress, decimalFactor(18));
        await approveTx.wait(TX_WAIT_TIME);
        const currentAllowance = await usdc.allowance(signer.address, currentConfig.marketAddress);
        expect(currentAllowance.toBigInt()).toBe(decimalFactor(18).toBigInt());
        const resetTx = await usdc.approve(currentConfig.marketAddress, decimalFactor(0));
        await resetTx.wait(TX_WAIT_TIME);
    });

    it('#balanceOf & transfer', async () => {
        const beforeBalance = await usdc.balanceOf(signer.address);
        const transferTx = await usdc.transfer(currentConfig.marketAddress, decimalFactor(18));
        await transferTx.wait(TX_WAIT_TIME);
        const afterBalance = await usdc.balanceOf(signer.address);
        expect(beforeBalance.sub(afterBalance).toBigInt()).toBe(decimalFactor(18).toBigInt());
    });

    it('#read contract', async () => {
        const [decimal, name, symbol, totalSupply] = await Promise.all([
            usdc.decimals(),
            usdc.name(),
            usdc.symbol(),
            usdc.totalSupply(),
        ]);
        expect(decimal).toBe(18);
        expect(name).toBe('USD');
        expect(symbol).toBe('USDC');
        expect(totalSupply).toBeDefined();
    });

    it('#transferFrom', async () => {
        // no idea how to test
    });
});
