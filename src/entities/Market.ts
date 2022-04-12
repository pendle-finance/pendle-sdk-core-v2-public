import type { Address, NetworkConnection, TokenAmount } from './types';
import { type BigNumber as BN, Contract } from 'ethers';
import { dummyABI } from '../dummy';

// TODO: Get this from the contract
export type MarketParameters = {};

export type MarketInfo = {
  ot: Address;
  scy: Address;
  marketParam: MarketParameters;
  currentImpliedYield: number;
  currentExchangeRate: BN;
};

export type UserMarketInfo = {
  marketAddress: Address;
  lpBalance: BN;
  otBalance: TokenAmount;
  scyBalance: TokenAmount;
  assetBalance: TokenAmount;
};

export class Market {
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

  getMarketInfo(): MarketInfo {
    return {} as unknown as MarketInfo;
  }

  getUserMarketInfo(user: Address): UserMarketInfo {
    return {} as unknown as UserMarketInfo;
  }
}
