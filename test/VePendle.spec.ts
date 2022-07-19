import { VotingEscrowPendleMainchain } from '@pendle/core-v2/typechain-types';
import { sign } from 'crypto';
import { BigNumber } from 'ethers';
import { Last } from 'react-bootstrap/esm/PageItem';
import { type Address, VePendle } from '../src';
import { ACTIVE_CHAIN_ID, networkConnection, testConfig, print, WALLET } from './util/testUtils';
const currentConfig = testConfig(ACTIVE_CHAIN_ID);

describe(VePendle, () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    it('#constructor', () => {
        expect(ve).toBeInstanceOf(VePendle);
        expect(ve.chainId).toBe(ACTIVE_CHAIN_ID);
    });

    it('#getContract', () => {
        const contract = ve.contract;
        expect(contract.address).toBe(currentConfig.veAddress);
    });
});

describe('contract', () => {
    const ve = new VePendle(currentConfig.veAddress, networkConnection, ACTIVE_CHAIN_ID);
    const signer = WALLET().wallet;
    const contract: VotingEscrowPendleMainchain = ve.contract as VotingEscrowPendleMainchain;
    it('read contract', async () => {
        // contract
        print(await contract.pendle());
    });
    it('lock', async () => {
        
    });
});
