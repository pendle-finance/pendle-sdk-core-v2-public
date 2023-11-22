import { BigNumber as BN, ethers } from 'ethers';
import { Address, ChainId, getContractAddresses, toAddress } from '../common';
import {
    ContractMethodNames,
    MetaMethodExtraParams,
    MetaMethodReturnType,
    MetaMethodType,
    MulticallStaticParams,
    PendleFeeDistributorV2ABI,
    PendleFeeDistributorV2,
    WrappedContract,
    ContractMetaMethod,
} from '../contracts';
import { PendleEntity, PendleEntityConfigOptionalAbi } from './PendleEntity';
import { PendleSdkError } from '../errors';
import { AsyncOrSync } from 'ts-essentials';
import { MerkleTree } from 'merkletreejs';

export type FeeDistributorV2Config = PendleEntityConfigOptionalAbi;

export type FeeDistributorV2MetaMethodReturnType<
    T extends MetaMethodType,
    MethodName extends ContractMethodNames<PendleFeeDistributorV2>,
    ExtraData extends object = object
> = MetaMethodReturnType<T, PendleFeeDistributorV2, MethodName, ExtraData & MetaMethodExtraParams<T>>;

export class FeeDistributorV2 extends PendleEntity {
    constructor(readonly address: Address, config: FeeDistributorV2Config) {
        super(address, { abi: PendleFeeDistributorV2ABI, ...config });
    }

    get contract() {
        return this._contract as WrappedContract<PendleFeeDistributorV2>;
    }

    static getFeeDistributor(config: FeeDistributorV2Config & { chainId: ChainId }) {
        const addr = getContractAddresses(config.chainId).FEE_DISTRIBUTORV2;
        if (addr === undefined) {
            throw new PendleSdkError(`FeeDistributorV2 is not deployed on chain ${config.chainId}`);
        }
        return new FeeDistributorV2(addr, config);
    }

    getProof(_user: Address, _totalAccruedAmount: BN): AsyncOrSync<ethers.BytesLike[]> {
        throw new PendleSdkError(
            'Unimplemented getProof. Manual proof can be passed througth the the last optional parameter.'
        );
    }

    getAccruedRewards(_user: Address): AsyncOrSync<BN> {
        throw new PendleSdkError('Unimplemented getAccruedRewards. Please passin accrued amount manually.');
    }

    async claimRetail<T extends MetaMethodType>(
        receiver: Address,
        totalAccruedAmount?: BN,
        params?: MetaMethodExtraParams<T> & {
            proof?: ethers.BytesLike[];
        }
    ): FeeDistributorV2MetaMethodReturnType<T, 'claimRetail', object> {
        const manualProof = params?.proof;
        const totalAccruedRewardGetter = async (context: ContractMetaMethod<PendleFeeDistributorV2, any, any>) => {
            if (totalAccruedAmount) return totalAccruedAmount;
            const user = await context.contract.signer.getAddress().then(toAddress);
            return this.getAccruedRewards(user);
        };
        const proofGetter = async (context: ContractMetaMethod<PendleFeeDistributorV2, any, any>) => {
            if (manualProof) return manualProof;
            const user = await context.contract.signer.getAddress().then(toAddress);
            return this.getProof(user, await totalAccruedRewardGetter(context));
        };
        return this.contract.metaCall.claimRetail(receiver, totalAccruedRewardGetter, proofGetter, params);
    }

    async claimProtocol<T extends MetaMethodType>(
        receiver: Address,
        pools: Address[],
        params?: MetaMethodExtraParams<T>
    ): FeeDistributorV2MetaMethodReturnType<T, 'claimProtocol', object> {
        return this.contract.metaCall.claimProtocol(receiver, pools, params);
    }

    async getProtocolClaimables(user: Address, pools: Address[], params: MulticallStaticParams): Promise<BN[]> {
        return this.contract.multicallStatic.getProtocolClaimables(user, pools, params);
    }

    async getProtocolTotalAccrued(user: Address, params: MulticallStaticParams): Promise<BN> {
        return this.contract.multicallStatic.getProtocolTotalAccrued(user, params);
    }

    async getMerkleRoot(params?: MulticallStaticParams): Promise<string> {
        return this.contract.multicallStatic.merkleRoot(params);
    }
}

export type MerkleLeafData = [address: Address, amount: BN];
export type FeeDistributorV2WithStaticProofConfig = FeeDistributorV2Config & {
    merkleTreeData: MerkleLeafData[];
};

export class MerkleTreeData {
    merkleTree: MerkleTree;
    lookupAccruedAmount = new Map<Address, BN>();
    constructor(merkleTreeData: MerkleLeafData[]) {
        merkleTreeData.forEach(([address, amount]) => this.lookupAccruedAmount.set(address, amount));
        const leaves = merkleTreeData.map(([address, amount]) =>
            ethers.utils.arrayify(MerkleTreeData.leaveHashHex(address, amount))
        );
        this.merkleTree = new MerkleTree(leaves, ethers.utils.keccak256, { sort: true });
    }

    static leaveHashHex(this: void, user: Address, amount: BN) {
        return ethers.utils.solidityKeccak256(['address', 'uint256'], [user, amount]);
    }

    getProof(user: Address, totalAccruedAmount: BN): AsyncOrSync<ethers.BytesLike[]> {
        const leaveHash = MerkleTreeData.leaveHashHex(user, totalAccruedAmount);
        return this.merkleTree.getHexProof(leaveHash);
    }

    getAccruedRewards(user: Address) {
        return this.lookupAccruedAmount.get(user);
    }
}

export class FeeDistributorV2WithStaticProof extends FeeDistributorV2 {
    merkleTreeData: MerkleTreeData;
    constructor(readonly address: Address, config: FeeDistributorV2WithStaticProofConfig) {
        super(address, config);
        this.merkleTreeData = new MerkleTreeData(config.merkleTreeData);
    }

    get merkleTree() {
        return this.merkleTreeData.merkleTree;
    }

    static getFeeDistributor(config: FeeDistributorV2WithStaticProofConfig & { chainId: ChainId }) {
        const addr = getContractAddresses(config.chainId).FEE_DISTRIBUTORV2;
        if (addr === undefined) {
            throw new PendleSdkError(`FeeDistributorV2 is not deployed on chain ${config.chainId}`);
        }
        return new FeeDistributorV2WithStaticProof(addr, config);
    }

    static leaveHashHex(this: void, user: Address, amount: BN) {
        return MerkleTreeData.leaveHashHex(user, amount);
    }

    override getAccruedRewards(user: Address) {
        const res = this.merkleTreeData.getAccruedRewards(user);
        if (res == undefined) {
            throw new PendleSdkError('User does not have accrued rewards');
        }
        return res;
    }

    override getProof(user: Address, totalAccruedAmount: BN): AsyncOrSync<ethers.BytesLike[]> {
        return this.merkleTreeData.getProof(user, totalAccruedAmount);
    }
}
