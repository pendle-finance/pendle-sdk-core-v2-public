import { BlockchainEntity, BlockchainEntityRead } from "./BlockchainEntities";
import { Address, NetworkConnection } from "./types";

export class YieldContractFactoryRead extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class YieldContractFactoryReadWrite extends YieldContractFactoryRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class YieldContractFactory extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): YieldContractFactoryRead {
        return new YieldContractFactoryRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): YieldContractFactoryReadWrite {
        return new YieldContractFactoryReadWrite(networkConnection);
    }
}