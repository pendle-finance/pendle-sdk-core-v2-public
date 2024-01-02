import * as pendleSDK from '../../src';
import * as tokenHelper from '../util/tokenHelper';
import * as testHelper from '../util/testHelper';
import * as constants from '../util/constants';

import { syAddress, ytAddress, marketAddress, signerAddress, chainId, router, sendTxWithInfApproval } from './setup';

describe('Router#addLiquiditySingleSyKeepYt', () => {
    testHelper.useRestoreEvmSnapShotAfterEach();

    let lpBalanceBefore: pendleSDK.BN;
    let syBalanceBefore: pendleSDK.BN;
    let ytBalanceBefore: pendleSDK.BN;
    let syAdd: pendleSDK.BN;

    beforeAll(async () => {
        [syBalanceBefore, lpBalanceBefore, ytBalanceBefore] = await Promise.all([
            tokenHelper.getBalance(syAddress, signerAddress),
            tokenHelper.getBalance(marketAddress, signerAddress),
            tokenHelper.getBalance(ytAddress, signerAddress),
        ]);
        syAdd = pendleSDK.bnMin(testHelper.valueToTokenAmount(syAddress, chainId), syBalanceBefore);
        if (syAdd.eq(0)) {
            throw new Error('skip test because syAdd is 0');
        }
    });

    it('should have user balance transferred correctly', async () => {
        const readerData = await sendTxWithInfApproval(
            () =>
                router.addLiquiditySingleSyKeepYt(marketAddress, syAdd, constants.SLIPPAGE_TYPE2, {
                    method: 'meta-method',
                }),
            [syAddress]
        );

        const [lpBalanceAfter, syBalanceAfter, ytBalanceAfter] = await tokenHelper.getUserBalances(signerAddress, [
            marketAddress,
            syAddress,
            ytAddress,
        ]);

        expect([lpBalanceBefore, lpBalanceAfter]).toHaveDifferenceBN(readerData.netLpOut, constants.DEFAULT_EPSILON);
        // YT out can not be exact, because the market state can change a little bit.
        expect([ytBalanceBefore, ytBalanceAfter]).toHaveDifferenceBN(readerData.netYtOut, constants.DEFAULT_EPSILON);
        expect([syBalanceBefore, syBalanceAfter]).toHaveDifferenceBN(syAdd.mul(-1));
    });
});
