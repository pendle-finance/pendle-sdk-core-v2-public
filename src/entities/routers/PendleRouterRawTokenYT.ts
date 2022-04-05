import { BlockchainEntity, BlockchainEntityRead } from "../BlockchainEntities";
import { Address, NetworkConnection } from "../types";

export class PendleRouterRawTokenYTRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterRawTokenYTReadWrite extends PendleRouterRawTokenYTRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterRawTokenYT extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): PendleRouterRawTokenYTRead {
        return new PendleRouterRawTokenYTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): PendleRouterRawTokenYTReadWrite {
        return new PendleRouterRawTokenYTReadWrite(networkConnection);
    }
}