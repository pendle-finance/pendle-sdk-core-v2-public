import { BlockchainEntity, BlockchainEntityRead, BlockchainEntityReadWrite } from "./BlockchainEntities";
import { Address, NetworkConnection } from "./types";

export class MarketFactoryRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class MarketFactoryReadWrite extends BlockchainEntityReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class MarketFactory extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): MarketFactoryRead {
        return new MarketFactoryRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): MarketFactoryReadWrite {
        return new MarketFactoryReadWrite(networkConnection);
    }
}