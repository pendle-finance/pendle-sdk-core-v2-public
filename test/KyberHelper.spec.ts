import { KyberHelper } from '../src/entities/KyberHelper';
import { DUMMY_ADDRESS } from './util/constants';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testEnv';

describe(KyberHelper, () => {
    const kyberHelper = new KyberHelper(currentConfig.router, ACTIVE_CHAIN_ID, networkConnection);

    const tokens = Object.entries(currentConfig.tokens).filter(
        ([name, address]) => name != 'fundKeeper' && name != 'faucet' && !name.startsWith('qi')
    );

    describe('checkSwappablePair', () => {
        const [tokenInName, tokenInAddr] = tokens[0];

        for (const [tokenOutName, tokenOutAddr] of tokens) {
            it(`${tokenInName}-${tokenOutName}`, async () => {
                expect(await kyberHelper.checkSwappablePair(tokenInAddr, tokenOutAddr)).toBe(true);
            });
            break;
        }

        it(`${tokenInName}-dummy`, async () => {
            expect(await kyberHelper.checkSwappablePair(tokenInAddr, DUMMY_ADDRESS)).toBe(false);
        });
    });
});
