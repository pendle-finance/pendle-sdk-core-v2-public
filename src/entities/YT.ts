import { ERC20, ERC20Read } from "./ERC20";
import { Address, NetworkConnection } from "./types";

export class YTRead extends ERC20Read {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class YTWrite extends YTRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class YT extends ERC20 {
    public address: Address;

    public constructor(_address: Address) {
        super(_address);
    }

    public read(networkConnection: NetworkConnection): YTRead {
        return new YTRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): YTWrite {
        return new YTWrite(networkConnection);
    }
}