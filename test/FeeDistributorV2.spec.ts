import { FeeDistributorV2WithStaticProof, toAddress, BN, Address } from '../src';
import { currentConfig, networkConnection } from './util/testEnv';
import { print } from './util/testHelper';
import * as dummyRewardData from '@pendle/core-v2-testnet/deployments/vependle-rewards/2023-04-06.json';
import { ethers } from 'ethers';
import * as testHelper from './util/testHelper';

(currentConfig.chainId === 43113 ? describe : describe.skip)('FeeDistributorV2', () => {
    const data = Object.entries(dummyRewardData.usersLeafData).map(
        ([addr, { amount }]) => [toAddress(addr), BN.from(amount)] satisfies [Address, BN]
    );

    let feeDistributor: FeeDistributorV2WithStaticProof;
    beforeAll(() => {
        feeDistributor = FeeDistributorV2WithStaticProof.getFeeDistributor({
            ...networkConnection,
            chainId: currentConfig.chainId,
            merkleTreeData: data,
            multicall: currentConfig.multicall,
        });

        testHelper.print(feeDistributor.merkleTree.toString());
    });

    it('merkle root check', () => {
        expect(ethers.utils.hexlify(feeDistributor.merkleTree.getHexRoot())).toBe(dummyRewardData.merkleRoot);
    });

    it('onchain merkle root check', async () => {
        const onchainMerkleRoot = await feeDistributor.getMerkleRoot();
        print({ onchainMerkleRoot });
        expect(ethers.utils.hexlify(feeDistributor.merkleTree.getHexRoot())).toBe(onchainMerkleRoot);
    });

    describe('write functions', () => {
        testHelper.useRestoreEvmSnapShotAfterEach();
        it('claimRetail', async () => {
            const testData = data[1];
            const [receiver, amount] = testData;
            print(testData);
            // const [balanceBefore] = await getUserBalances(receiver, [NATIVE_ADDRESS_0x00]);

            const proof = await feeDistributor.getProof(receiver, amount);
            testHelper.print(
                feeDistributor.merkleTree.verify(
                    proof,
                    FeeDistributorV2WithStaticProof.leaveHashHex(receiver, amount),
                    await feeDistributor.getMerkleRoot()
                )
            );
            const metaMethod = await feeDistributor.claimRetail(receiver, amount, { method: 'meta-method' });
            const amountOut = await metaMethod
                .connect(new ethers.VoidSigner(receiver, networkConnection.provider))
                .callStatic();
            print(amountOut);

            // await metaMethod.send().then((tx) => tx.wait());
            // const [balanceAfter] = await getUserBalances(testData[0], [NATIVE_ADDRESS_0x00]);
            //
            // expect(balanceAfter.sub(balanceBefore)).toEqBN(amountOut);
        });
    });
});
