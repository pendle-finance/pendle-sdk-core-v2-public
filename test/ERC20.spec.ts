import {
    ERC20Entity,
    createERC20,
    NATIVE_ADDRESS_0x00,
    ERC20Like,
    decimalFactor,
    NATIVE_ADDRESS_0xEE,
    NativeERC20,
    isNativeToken,
} from '../src';
import { INF } from './util/constants';
import { currentConfig, networkConnection, BLOCK_CONFIRMATION, signerAddress } from './util/testEnv';
import { describeWithMulticall } from './util/testHelper';
import * as testHelper from './util/testHelper';

describe('ERC20Like', () => {
    const usdc = new ERC20Entity(currentConfig.tokens.USDC, networkConnection);
    const usdcWithMulticall = new ERC20Entity(currentConfig.tokens.USDC, {
        ...networkConnection,
        multicall: currentConfig.multicall,
    });
    const nativeToken = createERC20(NATIVE_ADDRESS_0x00, {
        ...networkConnection,
        chainId: currentConfig.chainId,
    });
    const tokens: Record<string, ERC20Like> = {
        usdc,
        usdcWithMulticall,
        nativeToken,
    };

    it('#ERC20Entity#constructor', () => {
        expect(usdc).toBeInstanceOf(ERC20Entity);
        expect(usdc.address).toBe(currentConfig.tokens.USDC);
        expect(usdc.contract.address).toBe(currentConfig.tokens.USDC);
    });

    for (const [tokenName, token] of Object.entries(tokens)) {
        const isERC20Entity = token instanceof ERC20Entity;
        describe(tokenName, () => {
            describe('basic info contract methods', () => {
                it('#decimals', async () => {
                    const decimals = await token.decimals();
                    expect(decimals).toBeGreaterThanOrEqual(6);
                });
                it('#name', async () => {
                    const name = await token.name();
                    expect(name).toBeDefined();
                });
                it('#symbol', async () => {
                    const symbol = await token.symbol();
                    expect(symbol).toBeDefined();
                });
                if (isERC20Entity) {
                    it('#totalSupply', async () => {
                        const totalSupply = await token.totalSupply();
                        expect(totalSupply).toBeGteBN(0);
                    });
                } else {
                    it('is native token address', () => {
                        expect(isNativeToken(token.address)).toBeTruthy();
                    });
                }
            });

            if (isERC20Entity) {
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
            }

            describe('write functions', () => {
                testHelper.useRestoreEvmSnapShotAfterEach();

                it('#allowance & #approve', async () => {
                    const approveAmount = decimalFactor(17);
                    await token
                        .approve(currentConfig.marketAddress, approveAmount)
                        .then((tx) => tx?.wait(BLOCK_CONFIRMATION));

                    const currentAllowance = await token.allowance(signerAddress, currentConfig.marketAddress);
                    if (token instanceof NativeERC20) {
                        expect(currentAllowance).toEqBN(INF);
                    } else {
                        expect(currentAllowance).toEqBN(approveAmount);
                    }
                });

                it('#balanceOf & #transfer', async () => {
                    const transferAmount = 1;
                    const beforeBalance = await token.balanceOf(signerAddress);
                    if (beforeBalance.lt(transferAmount)) {
                        throw new Error('Not enough balance to test transfer');
                    }

                    const tx = await token
                        .transfer(NATIVE_ADDRESS_0xEE, transferAmount)
                        .then((tx) => tx.wait(BLOCK_CONFIRMATION));

                    const afterBalance = await token.balanceOf(signerAddress);

                    if (token instanceof NativeERC20) {
                        const txFee = tx.gasUsed.mul(tx.effectiveGasPrice);
                        expect(beforeBalance.sub(afterBalance)).toEqBN(txFee.add(transferAmount));
                    } else {
                        expect(beforeBalance.sub(afterBalance)).toEqBN(transferAmount);
                    }
                });
            });
        });
    }
});
