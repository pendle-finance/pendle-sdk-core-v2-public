import { ERC20, decimalFactor } from '../src';
import { currentConfig, describeWrite, networkConnection, BLOCK_CONFIRMATION, signerAddress } from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe(ERC20, () => {
    const usdc = new ERC20(currentConfig.tokens.USDC, networkConnection);

    it('#constructor', () => {
        expect(usdc).toBeInstanceOf(ERC20);
        expect(usdc.address).toBe(currentConfig.tokens.USDC);
        expect(usdc.contract.address).toBe(currentConfig.tokens.USDC);
    });

    describeWithMulticall((multicall) => {
        it('#contract', async () => {
            const [decimal, name, symbol, totalSupply] = await Promise.all([
                usdc.decimals({ multicall }),
                usdc.name({ multicall }),
                usdc.symbol({ multicall }),
                usdc.totalSupply({ multicall }),
            ]);
            expect(decimal).toBeGreaterThanOrEqual(6);
            expect(name).toBeDefined();
            expect(symbol).toBeDefined();
            expect(totalSupply).toBeGteBN(0);
        });
    });

    describeWrite(() => {
        it('#allowance & #approve', async () => {
            const approveAmount = decimalFactor(17);
            await usdc.approve(currentConfig.marketAddress, approveAmount).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const currentAllowance = await usdc.allowance(signerAddress, currentConfig.marketAddress);
            expect(currentAllowance).toEqBN(approveAmount);
        });

        it('#balanceOf & #transfer', async () => {
            const transferAmount = 1;
            const beforeBalance = await usdc.balanceOf(signerAddress);
            if (beforeBalance.lt(transferAmount)) {
                console.log('Not enough balance to test transfer');
                return;
            }

            await usdc.transfer(currentConfig.marketAddress, transferAmount).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const afterBalance = await usdc.balanceOf(signerAddress);
            expect(beforeBalance.sub(afterBalance)).toEqBN(transferAmount);
        });
    });
});
