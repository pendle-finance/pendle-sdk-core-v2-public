import { ERC20Like } from './ERC20Like';
import { ERC20Entity, ERC20EntityConfig } from './ERC20Entity';
import { NativeERC20, NativeERC20Config } from './NativeERC20';
import { isNativeToken, Address } from '../../common';

export type ERC20Config = ERC20EntityConfig & NativeERC20Config;

export function createERC20(tokenAddress: Address, config: ERC20Config): ERC20Like {
    if (isNativeToken(tokenAddress)) {
        return new NativeERC20(tokenAddress, config);
    }
    return new ERC20Entity(tokenAddress, config);
}
