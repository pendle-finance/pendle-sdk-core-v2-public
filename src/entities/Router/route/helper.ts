import { isNativeToken } from '../../../common';
import { TokenInput } from '../types';
import { ethers } from 'ethers';

export function txOverridesValueFromTokenInput(tokenInput: TokenInput): ethers.CallOverrides {
    if (!isNativeToken(tokenInput.tokenIn)) return {};
    return { value: tokenInput.netTokenIn };
}
