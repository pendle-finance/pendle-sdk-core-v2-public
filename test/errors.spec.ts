import { SyEntity, PendleContractError } from '../src';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection, WALLET } from './util/testUtils';
import './util/bigNumberMatcher';

describe('Custom error', () => {
    const syAddress = currentConfig.market.SY;
    const sy = new SyEntity(syAddress, ACTIVE_CHAIN_ID, networkConnection);
    const signer = WALLET().wallet;
    const errorMessage = PendleContractError.errorMessageHandler['SYZeroDeposit']();
    const slippage = 0.1;

    it('catch Entity error', async () => {
        await expect(sy.deposit(signer.address, currentConfig.market.token, 0, slippage)).rejects.toThrow(errorMessage);
    });

    it('catch contract call static', async () => {
        await expect(sy.contract.callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)).rejects.toThrow(
            errorMessage
        );
    });

    it('catch estimate gas', async () => {
        await expect(sy.contract.estimateGas.deposit(signer.address, currentConfig.market.token, 0, 0)).rejects.toThrow(
            `Gas estimation error: ${errorMessage}`
        );
    });

    it('catch estimate gas without custom error', async () => {
        await expect(
            sy.contract.estimateGas.transferFrom(currentConfig.market.market, signer.address, 1)
        ).rejects.toThrow('Gas estimation error: ERC20: insufficient allowance');
    });

    it('catch contract call', async () => {
        await expect(sy.contract.functions.deposit(signer.address, currentConfig.market.token, 0, 0)).rejects.toThrow(
            errorMessage
        );
    });

    it('catch multicall error', async () => {
        await expect(
            currentConfig.multicall
                .wrap(sy.contract)
                .callStatic.deposit(signer.address, currentConfig.market.token, 0, 0)
        ).rejects.toThrow(errorMessage);
    });
});
