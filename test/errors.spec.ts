import { SyEntity, PendleContractError, Address } from '../src';
import { currentConfig, describeWrite, networkConnectionWithChainId, signer, signerAddress } from './util/testEnv';

describeWrite('Custom error', () => {
    const syAddress = currentConfig.market.SY;
    const sy = new SyEntity(syAddress, networkConnectionWithChainId);
    const errorMessage = PendleContractError.errorMessageHandler['SYZeroDeposit']();
    const slippage = 0.1;
    let tokenIn: Address;

    beforeAll(async () => {
        tokenIn = await sy.getTokensIn().then((tokens) => tokens[0]);
    });

    it('catch Entity error', async () => {
        await expect(sy.deposit(signerAddress, tokenIn, 0, slippage)).rejects.toThrow(errorMessage);
    });

    it('catch contract call static', async () => {
        await expect(sy.contract.callStatic.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(errorMessage);
    });

    it('catch estimate gas', async () => {
        await expect(sy.contract.estimateGas.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(
            `Gas estimation error: ${errorMessage}`
        );
    });

    it('catch estimate gas without custom error', async () => {
        await expect(
            sy.contract.estimateGas.transferFrom(currentConfig.market.market, signer.address, 1)
        ).rejects.toThrow('Gas estimation error: ERC20: insufficient allowance');
    });

    it('catch contract call', async () => {
        await expect(sy.contract.functions.deposit(signer.address, tokenIn, 0, 0)).rejects.toThrow(errorMessage);
    });

    it('catch multicall error', async () => {
        await expect(
            currentConfig.multicall.wrap(sy.contract).callStatic.deposit(signer.address, tokenIn, 0, 0)
        ).rejects.toThrow(errorMessage);
    });
});
