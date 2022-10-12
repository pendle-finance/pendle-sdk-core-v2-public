import { ScyEntity, PendleContractError } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';
import './util/bigNumberMatcher';

describe('Custom error', () => {
    const scyAddress = currentConfig.market.SCY;
    const scy = new ScyEntity(scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const errorMessage = PendleContractError.errorMessageHandler['SCYZeroDeposit']();
    const slippage = 0.1;

    it('catch Entity error', async () => {
        await expect(scy.deposit(signer.address, currentConfig.market.token, 0, slippage)).rejects.toThrow(
            errorMessage
        );
    });

    it('catch contract call static', async () => {
        await expect(
            scy.scyContract.callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });

    it('catch estimate gas', async () => {
        await expect(
            scy.scyContract.estimateGas.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(`Gas estimation error: ${errorMessage}`);
    });

    it('catch contract call', async () => {
        await expect(
            scy.scyContract.functions.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });

    it('catch multicall error', async () => {
        await expect(
            currentConfig.multicall
                .wrap(scy.scyContract)
                .callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });
});
