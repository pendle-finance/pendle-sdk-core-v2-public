import { BlockchainEntity, BlockchainEntityRead, BlockchainEntityReadWrite } from "../BlockchainEntities";
import { Address, NetworkConnection } from "../types";

export class PendleRouterYTRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterYTReadWrite extends BlockchainEntityReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterYT extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): PendleRouterYTRead {
        return new PendleRouterYTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): PendleRouterYTReadWrite {
        return new PendleRouterYTReadWrite(networkConnection);
    }
}