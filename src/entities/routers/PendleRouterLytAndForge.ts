import { BlockchainEntity, BlockchainEntityRead, BlockchainEntityReadWrite } from "../BlockchainEntities";
import { Address, NetworkConnection } from "../types";

export class PendleRouterLytAndForgeRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterLytAndForgeReadWrite extends BlockchainEntityReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class PendleRouterLytAndForge extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): PendleRouterLytAndForgeRead {
        return new PendleRouterLytAndForgeRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): PendleRouterLytAndForgeReadWrite {
        return new PendleRouterLytAndForgeReadWrite(networkConnection);
    }
}