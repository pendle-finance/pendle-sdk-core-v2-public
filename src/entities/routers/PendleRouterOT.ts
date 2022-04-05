import { BlockchainEntity, BlockchainEntityRead } from "../BlockchainEntities";
import { Address, NetworkConnection } from "../types";

export class PendleRouterOTRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterOTReadWrite extends PendleRouterOTRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterOT extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): PendleRouterOTRead {
        return new PendleRouterOTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): PendleRouterOTReadWrite {
        return new PendleRouterOTReadWrite(networkConnection);
    }
}