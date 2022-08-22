import { Contract } from 'ethers';
import { ERC20 } from '../src';
import { decimalFactor } from '../src/entities/helper';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testUtils';
import './util/BigNumberMatcher';

describe(ERC20, () => {
    const usd = new ERC20(currentConfig.usdAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(usd).toBeInstanceOf(ERC20);
        expect(usd.address).toBe(currentConfig.usdAddress);
        expect(usd.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(usd.contract).toBeInstanceOf(Contract);
        expect(usd.contract.address).toBe(currentConfig.usdAddress);
    });

    it('#contract', async () => {
        const [decimal, name, symbol, totalSupply] = await Promise.all([
            usd.decimals(),
            usd.name(),
            usd.symbol(),
            usd.totalSupply(),
        ]);
        expect(decimal).toBeGreaterThanOrEqual(6);
        expect(name).toBeDefined();
        expect(symbol).toBeDefined();
        expect(totalSupply).toBeGteBN(0);
    });

    describeWrite(() => {
        it('#allowance & #approve', async () => {
            const approveAmount = decimalFactor(17);
            await usd.approve(currentConfig.marketAddress, approveAmount).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const currentAllowance = await usd.allowance(signer.address, currentConfig.marketAddress);
            expect(currentAllowance).toEqBN(approveAmount);

            await usd.approve(currentConfig.marketAddress, 0).then((tx) => tx.wait(BLOCK_CONFIRMATION));
        });

        it('#balanceOf & #transfer', async () => {
            const transferAmount = decimalFactor(17);
            const beforeBalance = await usd.balanceOf(signer.address);

            await usd.transfer(currentConfig.marketAddress, transferAmount).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const afterBalance = await usd.balanceOf(signer.address);
            expect(beforeBalance.sub(afterBalance)).toEqBN(transferAmount);
        });
    });
});
