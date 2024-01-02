import { ERC20Entity, ContractMetaMethod } from '../src';
import { BLOCK_CONFIRMATION, currentConfig, networkConnection } from './util/testEnv';
import * as testHelper from './util/testHelper';
import { DUMMY_ADDRESS } from './util/constants';
import { BigNumber as BN } from 'ethers';

describe('Contract Helpers', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    const signer = networkConnection.signer;
    const signerAddress = networkConnection.signerAddress;
    const pendle = new ERC20Entity(currentConfig.pendle, { provider: networkConnection.provider });
    const approveAmount = 69;

    const metaCallPromise = pendle.approve(DUMMY_ADDRESS, approveAmount, {
        method: 'meta-method',
    });

    let metaCall: Awaited<typeof metaCallPromise>;

    beforeAll(async () => {
        metaCall = await metaCallPromise;

        await pendle.contract
            .connect(signer)
            .approve(DUMMY_ADDRESS, 0)
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
    });

    it('#send method', async () => {
        await metaCall
            .connect(signer)
            .send()
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));

        const allowance = await pendle.allowance(signerAddress, DUMMY_ADDRESS);
        expect(allowance).toEqBN(approveAmount);
    });

    it('#call static method', async () => {
        await metaCall.callStatic();

        // callStatic should not change the state of the blockchain
        const allowance = await pendle.allowance(signerAddress, DUMMY_ADDRESS);
        expect(allowance).toEqBN(0);
    });

    it('#multicall static method', async () => {
        await metaCall.multicallStatic({ multicall: currentConfig.multicall });

        // callStatic should not change the state of the blockchain
        const allowance = await pendle.allowance(signerAddress, DUMMY_ADDRESS);
        expect(allowance).toEqBN(0);
    });

    it('#estimate gas', async () => {
        const gasLimit = await metaCall.estimateGas();

        const tx = await metaCall
            .connect(signer)
            .send()
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        expect(gasLimit).toEqBN(tx.cumulativeGasUsed);
    });

    it('#send with overrides', async () => {
        const lastBaseFeePerGas = await networkConnection.provider
            .getFeeData()
            .then((feeData) => feeData.lastBaseFeePerGas ?? BN.from(0));
        const gasPrice = lastBaseFeePerGas.add(69_69_69_69_69_69);

        const tx = await metaCall
            .connect(signer)
            .send({ overrides: { gasPrice: gasPrice } })
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        expect(tx.effectiveGasPrice).toEqBN(gasPrice);
    });

    it('#call static with overrides', async () => {
        const sendPendleMetaCall = await pendle.transfer(DUMMY_ADDRESS, 1, {
            method: 'meta-method',
        });

        await expect(() => sendPendleMetaCall.callStatic({ overrides: { from: DUMMY_ADDRESS } })).rejects.toThrow(
            'TRANSFER_EXCEED_BALANCE'
        );
    });

    describe('#extractParams', () => {
        it('with normal params', async () => {
            const params = await metaCall.extractParams();
            // console.log(params);
            expect(params[0]).toEqual(DUMMY_ADDRESS);
            expect(params[1]).toEqual(approveAmount);
        });

        it('with getter utils', async () => {
            const metaMethod = await pendle.contract.metaCall.approve(
                ContractMetaMethod.utils.getContractSignerAddress,
                approveAmount,
                { method: 'meta-method' }
            );
            const params = await metaMethod.connect(networkConnection.signer).extractParams();
            expect(params[0]).toEqual(networkConnection.signerAddress);
            expect(params[1]).toEqual(approveAmount);
        });
    });
});
