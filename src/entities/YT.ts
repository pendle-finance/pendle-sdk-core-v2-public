import type { PendleYieldToken } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection, TokenAmount } from './types';
import { type BigNumber as BN, Contract } from 'ethers';
import { OT } from './OT';
import { dummyABI } from '../dummy';

export type UserYOInfo = {
  ytAddress: Address;
  ytBalance: BN;
  otAddress: Address;
  otBalance: BN;
  unclaimedInterest: TokenAmount;
  unclaimedRewards: TokenAmount[];
};

export type YOInfo = {
  exchangeRate: BN;
  totalSupply: BN;
  rewardIndexes: AddressAndIndex[];
};

export type AddressAndIndex = {
  address: Address;
  index: BN;
};

export class YT {
  public address: Address;
  public contract: PendleYieldToken;
  public chainId: number;

  protected networkConnection: NetworkConnection;

  public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
    this.address = _address;
    this.networkConnection = _networkConnection;
    this.chainId = _chainId;
    this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleYieldToken;
  }

  async userInfo(user: Address): Promise<UserYOInfo> {
    const ytAddress = this.address;
    const [ytBalance, otAddress, scyAddress, { dueInterest }, rewardTokens] = await Promise.all([
      this.contract.callStatic.balanceOf(user),
      this.contract.callStatic.OT(),
      this.contract.callStatic.SCY(),
      this.contract.callStatic.data(user),
      this.contract.callStatic.getRewardTokens(),
    ]);
    const unclaimedInterest = { token: scyAddress, amount: dueInterest };
    const getRewardBalance = async (token: Address): Promise<TokenAmount> => ({
      token,
      amount: (await this.contract.callStatic.userReward(user, token)).accruedReward,
    });
    const [otBalance, unclaimedRewards] = await Promise.all([
      new OT(otAddress, this.networkConnection, this.chainId).contract.callStatic.balanceOf(user),
      Promise.all(rewardTokens.map(getRewardBalance)),
    ]);
    return { ytAddress, ytBalance, otAddress, otBalance, unclaimedInterest, unclaimedRewards };
  }

  async getInfo(): Promise<YOInfo> {
    const [exchangeRate, totalSupply, rewardTokens] = await Promise.all([
      this.contract.callStatic.getScyIndexBeforeExpiry(),
      this.contract.callStatic.totalSupply(),
      this.contract.callStatic.getRewardTokens(),
    ]);
    const getRewardIndex = async (token: Address): Promise<AddressAndIndex> => ({
      address: token,
      index: (await this.contract.callStatic.globalReward(token)).index,
    });
    const rewardIndexes = await Promise.all(rewardTokens.map(getRewardIndex));
    return { exchangeRate, totalSupply, rewardIndexes };
  }
}
