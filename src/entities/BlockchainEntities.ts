import { Signer } from '@ethersproject/abstract-signer';
import { NetworkConnection } from "./types"

export class BlockchainEntityRead {
  protected _networkConnection: NetworkConnection;
  public constructor(networkConnection: NetworkConnection) {
    this._networkConnection = networkConnection;
  }
}

export class BlockchainEntityReadWrite extends BlockchainEntityRead {
  public constructor(networkConnection: NetworkConnection) {
    if (!(networkConnection.signer instanceof Signer)) {
      throw Error("Signer is not provided when constructing BlockchainEntityReadWrite");
    }
    super(networkConnection);
  }
}

export class BlockchainEntity {
  constructor() {}
  public read(networkConnection: NetworkConnection): BlockchainEntityRead {
    return new BlockchainEntityRead(networkConnection);
  }

  public readWrite(networkConnection: NetworkConnection): BlockchainEntityReadWrite {
    return new BlockchainEntityReadWrite(networkConnection);
  }
}
