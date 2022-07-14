import { yellow } from '@material-ui/core/colors';
import { BigNumber } from 'ethers';
import { type Address, YT,SCY } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection,testConfig,WALLET,print } from './testUtils';

const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(YT,() => {
    const yt = new YT(currentConfig.ytAddress, networkConnection, ACTIVE_CHAIN_ID);
    const scy = new SCY(currentConfig.scyAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor',async () => {
        expect(yt).toBeInstanceOf(YT);
        expect(yt.address).toBe(currentConfig.ytAddress);
        expect(yt.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    // need to send scy to contract first
    it('#contract',async () => {
        const {contract} = yt;
        await contract.connect(signer).mintPY(signer.address,signer.address);
    })
    it('#userInfo',async () => {
        const userInfo = await yt.getInfo();
        expect(userInfo).toBeDefined();
        
    })
    it('#getInfo',async () => {
        const info = await yt.getInfo();
        expect(info).toBeDefined();
    })
})