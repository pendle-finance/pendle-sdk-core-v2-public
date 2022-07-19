import { ACTIVE_CHAIN_ID, networkConnection, testConfig, WALLET, print } from './util/testUtils';
import { ERC20 } from '../src/entities/ERC20';
import { BigNumber } from 'ethers';
const currentConfig = testConfig(ACTIVE_CHAIN_ID);
describe('draft test', () => {
    const signer = WALLET().wallet;
    const usdc = new ERC20(currentConfig.usdcAddress, networkConnection, ACTIVE_CHAIN_ID);
    it('test approve', async () => {
        const allowanceBefore = await usdc.allowance(signer.address, currentConfig.scyAddress);
        //console.log(allowanceBefore.toBigInt());
        const approveTx = await usdc.approve(currentConfig.scyAddress, BigNumber.from(10).pow(3));
        await approveTx.wait(1);
        const allowanceAfter = await usdc.allowance(signer.address, currentConfig.scyAddress);
        print(allowanceAfter.toBigInt());
    });
});
