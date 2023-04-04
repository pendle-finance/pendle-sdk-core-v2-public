import { ERC20Like } from './ERC20Like';
import { ERC20Entity, ERC20EntityConfig } from './ERC20Entity';
import { sGLP_ERC20Entity } from './sGLP_ERC20Entity';
import { NativeERC20, NativeERC20Config } from './NativeERC20';
import { isNativeToken, Address, ChainId, CHAIN_ID_MAPPING, areSameAddresses, toAddress } from '../../common';

export type ERC20Config = ERC20EntityConfig &
    NativeERC20Config & {
        chainId: ChainId;
    };

export function createERC20(tokenAddress: Address, config: ERC20Config): ERC20Like {
    if (
        config.chainId === CHAIN_ID_MAPPING.ARBITRUM &&
        areSameAddresses(toAddress('0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf'), tokenAddress)
    ) {
        const fsGLP = new ERC20Entity(toAddress('0x1aDDD80E6039594eE970E5872D247bf0414C8903'), config);
        return new sGLP_ERC20Entity(tokenAddress, { ...config, fsGLP });
    }
    if (isNativeToken(tokenAddress)) {
        return new NativeERC20(tokenAddress, config);
    }
    return new ERC20Entity(tokenAddress, config);
}
