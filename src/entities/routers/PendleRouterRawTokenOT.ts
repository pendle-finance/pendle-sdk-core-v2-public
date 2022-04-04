import { BlockchainEntity, BlockchainEntityRead, BlockchainEntityReadWrite } from "../BlockchainEntities";
import { Address, NetworkConnection } from "../types";

export class PendleRouterRawTokenOTRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterRawTokenOTReadWrite extends BlockchainEntityReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterRawTokenOT extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): PendleRouterRawTokenOTRead {
        return new PendleRouterRawTokenOTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): PendleRouterRawTokenOTReadWrite {
        return new PendleRouterRawTokenOTReadWrite(networkConnection);
    }
}