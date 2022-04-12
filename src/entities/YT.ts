import type { Address, NetworkConnection, TokenAmount } from './types';
import { type BigNumber as BN, Contract } from 'ethers';
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
  totalInterest: BN;
};

export class YT {
  public address: Address;
  public contract: Contract; // To-Be replaced by typechain class
  public chainId: number;

  protected networkConnection: NetworkConnection;
  public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
    this.address = _address;
    this.networkConnection = _networkConnection;
    this.chainId = _chainId;
    this.contract = new Contract(_address, dummyABI, _networkConnection.provider);
  }

  userInfo(user: Address): UserYOInfo {
    return '' as unknown as UserYOInfo;
  }

  getInfo(): YOInfo {
    return {} as unknown as YOInfo;
  }
}
