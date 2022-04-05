import { ERC20, ERC20Read } from "./ERC20";
import { Address, NetworkConnection } from "./types";

export class MarketRead extends ERC20Read {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class MarketWrite extends MarketRead {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class Market extends ERC20 {
    public address: Address;

    public constructor(_address: Address) {
        super(_address);
    }

    public read(networkConnection: NetworkConnection): MarketRead {
        return new MarketRead(networkConnection);
    }

    public readWrite(networkConnection: NetworkConnection): MarketWrite {
        return new MarketWrite(networkConnection);
    }
}