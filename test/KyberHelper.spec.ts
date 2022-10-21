import { KyberHelper } from '../src/entities/KyberHelper';
import { ACTIVE_CHAIN_ID, currentConfig, networkConnection } from './util/testUtils';

describe(KyberHelper, () => {
    const kyberHelper = new KyberHelper(currentConfig.router, ACTIVE_CHAIN_ID, networkConnection);

    it('checkSwappablePair', async () => {
        let tokens = Object.entries(currentConfig.tokens)
            .filter(([name, address]) => name != 'fundKeeper' && name != 'faucet' && !name.startsWith('qi'))
            .map(([_, address]) => address);

        for (const tokenIn of tokens) {
            for (const tokenOut of tokens) {
                expect(await kyberHelper.checkSwappablePair(tokenIn, tokenOut)).toBe(true);
            }
        }

        expect(await kyberHelper.checkSwappablePair(currentConfig.tokens.WETH, currentConfig.tokens.qiAVAX)).toBe(
            false
        );
    });
});
