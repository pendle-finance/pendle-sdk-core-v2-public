import { ERC20 } from '../src';
import { ACTIVE_CHAIN_ID, BLOCK_CONFIRMATION, currentConfig, describeWrite, networkConnection } from './util/testEnv';
import { evm_revert, evm_snapshot } from './util/testHelper';
import { DUMMY_ADDRESS } from './util/constants';
import { BigNumber as BN } from 'ethers';

describeWrite('Contract Helpers', () => {
    const signer = networkConnection.signer;
    const signerAddress = signer.address;
    const pendle = new ERC20(currentConfig.pendle, ACTIVE_CHAIN_ID, { provider: networkConnection.provider });
    const approveAmount = 69;

    let localSnapshotId = '';
    let metaCallPromise = pendle.approve(DUMMY_ADDRESS, approveAmount, {
        method: 'meta-method',
    });

    let metaCall: Awaited<typeof metaCallPromise>;

    beforeAll(async () => {
        metaCall = await metaCallPromise;

        await pendle.contract
            .connect(signer)
            .approve(DUMMY_ADDRESS, 0)
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));

        localSnapshotId = await evm_snapshot();
    });

    afterEach(async () => {
        await evm_revert(localSnapshotId);
        localSnapshotId = await evm_snapshot();
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
        expect(gasLimit).toEqBN(tx.gasUsed);
    });

    it('#send with overrides', async () => {
        const lastBaseFeePerGas = await networkConnection.provider
            .getFeeData()
            .then((feeData) => feeData.lastBaseFeePerGas ?? BN.from(0));
        const gasPrice = lastBaseFeePerGas.add(69_69_69_69_69_69);

        const tx = await metaCall
            .connect(signer)
            .send({ gasPrice: gasPrice })
            .then((tx) => tx.wait(BLOCK_CONFIRMATION));
        expect(tx.effectiveGasPrice).toEqBN(gasPrice);
    });

    it('#call static with overrides', async () => {
        const sendPendleMetaCall = await pendle.transfer(DUMMY_ADDRESS, 1, {
            method: 'meta-method',
        });

        await expect(() => sendPendleMetaCall.callStatic({ from: DUMMY_ADDRESS })).rejects.toThrow(
            'ERC20: transfer amount exceeds balance'
        );
    });
});
