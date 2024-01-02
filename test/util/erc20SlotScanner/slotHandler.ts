import * as pendleSDK from '../../../src';
import * as ethers from 'ethers';
import { ERC20BalanceSlot } from './types';

export async function setERC20Balance(
    address: pendleSDK.Address,
    user: pendleSDK.Address,
    value: pendleSDK.BN,
    [slot, reverse]: ERC20BalanceSlot,
    provider: ethers.providers.JsonRpcProvider
) {
    const order = reverse ? [slot, user] : [user, slot];
    const index = ethers.utils.hexValue(ethers.utils.solidityKeccak256(['uint256', 'uint256'], order));
    // const valueStr = value.toHexString().replace('0x0', '0x');
    const valueStr = ethers.utils.hexZeroPad(value.toHexString(), 32);
    await provider.send('hardhat_setStorageAt', [address, index, valueStr]);
}

export async function getERC20BalanceFromStorage(
    address: pendleSDK.Address,
    user: pendleSDK.Address,
    [slot, reverse]: ERC20BalanceSlot,
    provider: ethers.providers.JsonRpcProvider
) {
    const order = reverse ? [slot, user] : [user, slot];
    const index = ethers.utils.solidityKeccak256(['uint256', 'uint256'], order);
    return provider.getStorageAt(address, index).then(
        (val) => pendleSDK.BN.from(val),
        () => ethers.constants.Zero
    );
}
