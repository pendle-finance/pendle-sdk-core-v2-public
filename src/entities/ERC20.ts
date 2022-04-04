import { BlockchainEntity, BlockchainEntityRead, BlockchainEntityReadWrite } from "./BlockchainEntities";
import { Address, NetworkConnection } from "./types";

export class ERC20Read extends BlockchainEntityRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class ERC20ReadWrite extends BlockchainEntityReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class ERC20 extends BlockchainEntity {
    public address: Address;

    public constructor(_address: Address) {
        super();
        this.address = _address;
    }
    public read(networkConnection: NetworkConnection): ERC20Read {
        return new ERC20Read(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): ERC20ReadWrite {
        return new ERC20ReadWrite(networkConnection);
    }
}