import type { PendleOwnershipToken } from '@pendle/core-v2/typechain-types';
import type { Address, NetworkConnection } from './types';
import type { UserYOInfo, YOInfo } from './YT';
import { YT } from './YT';
import { Contract } from 'ethers';
import { dummyABI } from '../dummy';

export class OT {
  public address: Address;
  public contract: PendleOwnershipToken;
  public chainId: number;
  public yt?: YT;

  protected networkConnection: NetworkConnection;

  public constructor(_address: Address, _networkConnection: NetworkConnection, _chainId: number) {
    this.address = _address;
    this.networkConnection = _networkConnection;
    this.chainId = _chainId;
    this.contract = new Contract(_address, dummyABI, _networkConnection.provider) as PendleOwnershipToken;
  }

  async getYT(): Promise<YT> {
    if (!this.yt) {
      const ytAddress = await this.contract.callStatic.YT();
      this.yt = new YT(ytAddress, this.networkConnection, this.chainId);
    }
    return this.yt;
  }

  async userInfo(user: Address): Promise<UserYOInfo> {
    return (await this.getYT()).userInfo(user);
  }

  async getInfo(): Promise<YOInfo> {
    return (await this.getYT()).getInfo();
  }
}
