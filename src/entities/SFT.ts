import { ERC20, ERC20Read, ERC20ReadWrite } from "./ERC20";
import { Address, NetworkConnection } from "./types";

export class SFTRead extends ERC20Read {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class SFTReadWrite extends ERC20ReadWrite {
    public constructor(networkConnection: NetworkConnection) {
        super(networkConnection)
    }
}

export class SFT extends ERC20 {
    public address: Address;
    
    public constructor(_address: Address) {
        super(_address);
    }

    public read(networkConnection: NetworkConnection): SFTRead {
        return new SFTRead(networkConnection);
    }
    
    public readWrite(networkConnection: NetworkConnection): SFTReadWrite {
        return new SFTReadWrite(networkConnection);
    }
}