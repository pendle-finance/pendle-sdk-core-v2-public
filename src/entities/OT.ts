import { ERC20, ERC20Read } from "./ERC20";
import { Address, NetworkConnection } from "./types";

export class OTRead extends ERC20Read {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class OTWrite extends OTRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class OT extends ERC20 {
    public address: Address;

    public constructor(_address: Address) {
        super(_address);
    }

    public read(networkConnection: NetworkConnection): OTRead {
        return new OTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): OTWrite {
        return new OTWrite(networkConnection);
    }
}