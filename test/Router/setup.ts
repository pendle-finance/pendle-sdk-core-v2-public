import { BN, Address } from '../../src';
import * as pendleSDK from '../../src';
import * as ethers from 'ethers';
import * as tokenHelper from '../util/tokenHelper';
import * as testEnv from '../util/testEnv';
import * as testHelper from '../util/testHelper';
import * as iters from 'itertools';
import { Promisable } from 'type-fest';
import { mockLimitOrderMatcher } from './limitOrderSetup';

export const router = pendleSDK.Router.getRouter({
    ...testEnv.currentConfig.routerConfig,
    limitOrderMatcher: mockLimitOrderMatcher,
});
export const signerAddress = testEnv.networkConnectionWithChainId.signerAddress;
export const marketAddress = testEnv.currentConfig.market.marketAddress;
export const syAddress = testEnv.currentConfig.market.syAddress;
export const ptAddress = testEnv.currentConfig.market.ptAddress;
export const ytAddress = testEnv.currentConfig.market.ytAddress;
export const sySdk = new pendleSDK.SyEntity(syAddress, testEnv.networkConnectionWithChainId);
export const marketEntity = new pendleSDK.MarketEntity(marketAddress, testEnv.networkConnectionWithChainId);
export const chainId = testEnv.currentConfig.chainId;
export const signer = testEnv.signer;

export const tokensInToTest = testEnv.currentConfig.market.tokensIn.filter(({ disableTesting }) => !disableTesting);
export const tokensOutToTest = testEnv.currentConfig.market.tokensOut.filter(({ disableTesting }) => !disableTesting);

export type MetaMethodCallback = () =>
    | Promisable<pendleSDK.ContractMetaMethod<pendleSDK.IPAllActionV3, any, any>>
    | Promisable<pendleSDK.ContractMetaMethod<pendleSDK.PendleRouterHelper, any, any>>
    | Promisable<
          | pendleSDK.ContractMetaMethod<pendleSDK.IPAllActionV3, any, any>
          | pendleSDK.ContractMetaMethod<pendleSDK.PendleRouterHelper, any, any>
      >;
export type SkipTxCheckCallback<T extends MetaMethodCallback> = (readerData: pendleSDK.MetaMethodData<T>) => boolean;

export type BalanceSnapshot = {
    lpBalance: BN;
    ptBalance: BN;
    syBalance: BN;
    ytBalance: BN;
    marketPtBalance: BN;
    marketSyBalance: BN;
};

export async function getSwapBalanceSnapshot(): Promise<BalanceSnapshot> {
    return ethers.utils.resolveProperties({
        lpBalance: tokenHelper.getBalance(marketAddress, signerAddress),
        ptBalance: tokenHelper.getBalance(ptAddress, signerAddress),
        syBalance: tokenHelper.getBalance(syAddress, signerAddress),
        ytBalance: tokenHelper.getBalance(ytAddress, signerAddress),
        marketPtBalance: tokenHelper.getBalance(ptAddress, marketAddress),
        marketSyBalance: tokenHelper.getBalance(syAddress, marketAddress),
    });
}

export function verifyPtSyBalanceChanges(balanceBefore: BalanceSnapshot, balanceAfter: BalanceSnapshot) {
    const ptBalanceDiff = balanceAfter.ptBalance.sub(balanceBefore.ptBalance);
    const marketPtBalanceDiff = balanceAfter.marketPtBalance.sub(balanceBefore.marketPtBalance);
    expect(ptBalanceDiff).toEqBN(marketPtBalanceDiff.mul(-1));

    const syBalanceDiff = balanceAfter.syBalance.sub(balanceBefore.syBalance);
    const marketSyBalanceDiff = balanceAfter.marketSyBalance.sub(balanceBefore.marketSyBalance);

    // There are SY fee that have not been accounted in the balance snapshot.
    // We use Lte instead.
    expect(syBalanceDiff).toBeLteBN(marketSyBalanceDiff.mul(-1));
}

async function batchInfApprove(tokens: Iterable<Address>): Promise<{
    gas: {
        used: BN;
        nativeSpent: BN;
    };
}> {
    const addressesToApprove = [router.address, router.getRouterHelper().address];

    const approvalParams = iters.flatmap(addressesToApprove, (spender) =>
        iters.imap(tokens, (token) => ({ token, spender }))
    );
    const filteredTxs: ethers.providers.TransactionReceipt[] = await tokenHelper
        .batchApprove(approvalParams)
        .then((result) => iters.map(result, ([, tx]) => tx));

    const totalGasUsed = filteredTxs.reduce((acc, { gasUsed }) => acc.add(gasUsed), BN.from(0));
    const totalNativeSpentForGas = filteredTxs.reduce(
        (acc, { gasUsed, effectiveGasPrice }) => acc.add(gasUsed.mul(effectiveGasPrice)),
        BN.from(0)
    );

    return { gas: { used: totalGasUsed, nativeSpent: totalNativeSpentForGas } };
}

export async function sendTxWithInfApproval<T extends MetaMethodCallback>(
    callback: T,
    tokens: Iterable<Address>,
    skipTxCheck?: SkipTxCheckCallback<T>
): Promise<
    pendleSDK.MetaMethodData<T> & {
        txReceipt: ethers.providers.TransactionReceipt;
        gas: {
            used: BN;
            nativeSpent: BN;
        };
    }
> {
    const { gas: approvalGas } = await batchInfApprove(tokens);

    const metaCall = await callback();

    if (skipTxCheck && skipTxCheck(metaCall.data)) {
        return metaCall.data;
    }

    const txReceipt: ethers.providers.TransactionReceipt = await metaCall
        .connect(signer)
        .send()
        .then((tx) => tx.wait(testEnv.BLOCK_CONFIRMATION));

    return {
        ...metaCall.data,
        txReceipt,
        gas: {
            used: approvalGas.used.add(txReceipt.gasUsed),
            nativeSpent: approvalGas.nativeSpent.add(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)),
        },
    };
}

async function prepareBalances() {
    await testHelper.prefetchAllAssetFromPendleBackend(chainId);
    const tokens = [syAddress, ptAddress, ytAddress, marketAddress];
    const setPendleTokenBalancePromises = tokens.map(async (token) =>
        testHelper.setPendleERC20Balance(token, signerAddress, testHelper.valueToTokenAmount(token, chainId).mul(2))
    );
    const increaseNativeBalancePromise = testHelper.increaseNativeBalance(signerAddress);

    const tokensIn = [
        ...tokensInToTest.map(({ address }) => address),
        ...testEnv.currentConfig.zappableTokensToTest.map(({ address }) => address),
    ];
    const setTokensInBalancePromises = tokensIn.map(async (token) => {
        return testHelper.setERC20Balance(token, signerAddress, testHelper.valueToTokenAmount(token, chainId));
    });
    await Promise.all([...setPendleTokenBalancePromises, increaseNativeBalancePromise, ...setTokensInBalancePromises]);
}

async function approveRouter() {
    const toBeApproved = [
        syAddress,
        ptAddress,
        ytAddress,
        marketAddress,
        ...tokensInToTest.map(({ address }) => address),
        ...tokensOutToTest.map(({ address }) => address),
    ].flat();
    await tokenHelper.batchApprove(
        toBeApproved.map((token) => ({
            token,
            amount: 0,
            spender: router.address,
        }))
    );
}

testHelper.useRestoreEvmSnapShotAfterAll();
beforeAll(async () => {
    await prepareBalances();
    await approveRouter();
});

export let balanceSnapshotBefore: BalanceSnapshot;
beforeAll(async () => {
    balanceSnapshotBefore = await getSwapBalanceSnapshot();
});

router.events.on('noRouteFound', (params) => {
    const cause = params.errorOptions?.cause;
    if (cause instanceof pendleSDK.RoutingError) {
        const routeErrors = cause.routeErrors;
        console.log('NoRouteFound', params, routeErrors);
    } else {
        console.log('NoRouteFound', params);
    }
});
