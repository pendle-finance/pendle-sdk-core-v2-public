import { ERC20 } from '../src';
import { decimalFactor } from '../src/entities/math';
import {
    ACTIVE_CHAIN_ID,
    currentConfig,
    describeWrite,
    networkConnection,
    BLOCK_CONFIRMATION,
    WALLET,
} from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';

describe(ERC20, () => {
    const usdc = new ERC20(currentConfig.tokens.USDC, ACTIVE_CHAIN_ID, networkConnection);
    const signer = WALLET().wallet;

    it('#constructor', () => {
        expect(usdc).toBeInstanceOf(ERC20);
        expect(usdc.address).toBe(currentConfig.tokens.USDC);
        expect(usdc.chainId).toBe(ACTIVE_CHAIN_ID);
        expect(usdc.contract.address).toBe(currentConfig.tokens.USDC);
    });

    describeWithMulticall((multicall) => {
        it('#contract', async () => {
            const [decimal, name, symbol, totalSupply] = await Promise.all([
                usdc.decimals(multicall),
                usdc.name(multicall),
                usdc.symbol(multicall),
                usdc.totalSupply(multicall),
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

            const currentAllowance = await usdc.allowance(signer.address, currentConfig.marketAddress);
            expect(currentAllowance).toEqBN(approveAmount);
        });

        it('#balanceOf & #transfer', async () => {
            const transferAmount = 1;
            const beforeBalance = await usdc.balanceOf(signer.address);
            if (beforeBalance.lt(transferAmount)) {
                console.log('Not enough balance to test transfer');
                return;
            }

            await usdc.transfer(currentConfig.marketAddress, transferAmount).then((tx) => tx.wait(BLOCK_CONFIRMATION));

            const afterBalance = await usdc.balanceOf(signer.address);
            expect(beforeBalance.sub(afterBalance)).toEqBN(transferAmount);
        });
    });
});
