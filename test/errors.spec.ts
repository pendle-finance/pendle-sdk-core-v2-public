import { SyEntity, PendleContractError } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';
import './util/bigNumberMatcher';

describe('Custom error', () => {
    const syAddress = currentConfig.market.SY;
    const sy = new SyEntity(syAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const errorMessage = PendleContractError.errorMessageHandler['SYZeroDeposit']();
    const slippage = 0.1;

    it('catch Entity error', async () => {
        await expect(sy.deposit(signer.address, currentConfig.market.token, 0, slippage)).rejects.toThrow(errorMessage);
    });

    it('catch contract call static', async () => {
        await expect(
            sy.syContract.callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });

    it('catch estimate gas', async () => {
        await expect(
            sy.syContract.estimateGas.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(`Gas estimation error: ${errorMessage}`);
    });

    it('catch contract call', async () => {
        await expect(sy.syContract.functions.deposit(signer.address, currentConfig.market.token, 0, 0)).rejects.toThrow(
            errorMessage
        );
    });

    it('catch multicall error', async () => {
        await expect(
            currentConfig.multicall
                .wrap(sy.syContract)
                .callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });
});
