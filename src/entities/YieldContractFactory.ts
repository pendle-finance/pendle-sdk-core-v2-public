import { Address, NetworkConnection } from './types';
import { Contract } from 'ethers';
import { dummyABI } from '../dummy';
export class YieldContractFactory {
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

  // Add additional functions below
}
